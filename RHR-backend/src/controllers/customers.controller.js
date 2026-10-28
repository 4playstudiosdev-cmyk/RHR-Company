const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { buildCustomerProfilePDF } = require('../services/customerProfilePdf.service');
const { withRetry } = require('../utils/withRetry');
const { reverseGeocode } = require('../utils/geocoding');
const { normalizePhone, phoneLast10 } = require('../utils/phone');
const { sortByMerchandisingOrder } = require('../services/products.service');
const { deleteCustomerPermanently } = require('../services/hardDelete.service');

// city/area are a phase31 addition — the named-column select below 400s
// outright if that migration hasn't run (unlike select('*'), which just
// omits missing columns), so this tries with them first and falls back
// to the old column list rather than breaking the whole Customers page.
const CUSTOMER_COLUMNS = 'id, company_id, full_name, phone, email, whatsapp_phone, is_approved, salesman_id, driver_id, shop_name, shop_address, shop_image_url, shop_latitude, shop_longitude, rate_tier, credit_limit, city, area, nic_number, nic_image_url, nic_back_image_url, profile_photo_url, created_at';
const CUSTOMER_COLUMNS_FALLBACK = 'id, company_id, full_name, phone, email, is_approved, salesman_id, driver_id, shop_name, shop_address, shop_latitude, shop_longitude, rate_tier, created_at';

const getCustomers = async (req, res) => {
  try {
    const user = req.user;
    const baseParams = { role: 'eq.customer', is_active: 'eq.true', order: 'full_name.asc' };
    if (user.role === 'salesman') {
      baseParams.salesman_id = `eq.${user.id}`;
    } else {
      const companyId = resolveCompanyId(req);
      if (companyId) baseParams.company_id = `eq.${companyId}`;
    }

    // Routed through the pgrestGet raw-https bypass (see
    // utils/directQuery.js) — this read was still on plain supabase-js,
    // which is what let a super_admin with no company_id query param
    // silently see every branch's customers blended together on a page
    // (e.g. Create Order) that forgot to pass one, instead of erroring
    // or being obviously wrong.
    let data;
    try {
      data = await pgrestGet('users', { ...baseParams, select: CUSTOMER_COLUMNS });
    } catch (e) {
      data = await pgrestGet('users', { ...baseParams, select: CUSTOMER_COLUMNS_FALLBACK });
    }

    // A salesman's "Your Customers" list needs last-order-date and
    // outstanding balance per customer to be useful at a glance — two
    // extra small batch queries (same small-dataset tradeoff already
    // made for recipe labels/salesman customer_count elsewhere in this
    // codebase) rather than N+1 per-customer calls.
    if ((user.role === 'salesman' || user.role === 'driver') && data?.length) {
      const ids = data.map((c) => c.id);
      const idList = ids.join(',');
      try {
        const [orders, ledgerEntries] = await Promise.all([
          pgrestGet('orders', { select: 'customer_id,created_at', customer_id: `in.(${idList})`, order: 'created_at.desc' }),
          pgrestGet('ledger_entries', { select: 'customer_id,running_balance,created_at', customer_id: `in.(${idList})`, order: 'created_at.desc' }),
        ]);
        const lastOrderByCustomer = {};
        (orders || []).forEach((o) => { if (!lastOrderByCustomer[o.customer_id]) lastOrderByCustomer[o.customer_id] = o.created_at; });
        const balanceByCustomer = {};
        (ledgerEntries || []).forEach((l) => { if (!(l.customer_id in balanceByCustomer)) balanceByCustomer[l.customer_id] = Number(l.running_balance); });

        data = data.map((c) => ({
          ...c,
          last_order_date: lastOrderByCustomer[c.id] || null,
          outstanding_balance: balanceByCustomer[c.id] ?? 0,
        }));
      } catch (e) { /* best-effort — the plain customer list still works without these */ }
    }

    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getPendingCustomers = async (req, res) => {
  try {
    // Routed through the raw-https bypass (see utils/directQuery.js),
    // same as every other list endpoint migrated off plain supabase-js
    // this session. Expanded select — the approval wizard's step 1
    // needs the full self-registered profile (NIC, shop photo, address,
    // city/area), not just the summary fields the old approve-button
    // card used.
    const params = {
      select: 'id,company_id,full_name,phone,email,whatsapp_phone,shop_name,shop_address,shop_image_url,city,area,nic_number,nic_image_url,nic_back_image_url,profile_photo_url,shop_latitude,shop_longitude,created_at',
      role: 'eq.customer',
      is_approved: 'eq.false',
      is_active: 'eq.true',
      order: 'created_at.desc',
    };
    const companyId = resolveCompanyId(req);
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('users', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getCustomerById = async (req, res) => {
  try {
    const user = req.user;
    let query  = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, is_approved, salesman_id, company_id, shop_name, shop_address, shop_latitude, shop_longitude, city, area, profile_photo_url, credit_limit, created_at')
      .eq('id', req.params.id)
      .eq('role', 'customer')
      .single();

    const { data, error: dbError } = await query;
    if (dbError) return error(res, 'Customer not found', 404);

    // Salesman can only view his own customers
    if (user.role === 'salesman' && data.salesman_id !== user.id) {
      return error(res, 'Access denied', 403);
    }

    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/customers — admin adds a customer account directly
// (phone-based, auto-approved) — mirrors the Salesmen/Drivers "Add"
// flow. Self-registration via the mobile app (registerCustomer in
// auth.service.js) still lands as is_approved: false; this one skips
// that queue since an admin is entering it by hand.
const createCustomer = async (req, res) => {
  try {
    const { full_name, phone, email, shop_name, shop_address, city, area, company_id, rate_tier, driver_id, shop_latitude, shop_longitude, credit_limit, shop_image_url, nic_number, nic_image_url, nic_back_image_url } = req.body;
    if (!full_name || !phone)
      return error(res, 'full_name and phone are required', 400);
    if (credit_limit != null && (isNaN(Number(credit_limit)) || Number(credit_limit) < 0))
      return error(res, 'credit_limit must be a non-negative number or null', 400);

    const isSalesman = req.user.role === 'salesman';
    const isDriver = req.user.role === 'driver';
    const targetCompanyId = (req.user.role === 'branch_admin' || isSalesman || isDriver)
      ? req.user.company_id
      : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    // A salesman registering their own customer always assigns
    // themselves — never another salesman, and never left unassigned.
    // A driver with sales access: the customer is theirs (driver_id =
    // themselves, below); assigning a salesman as well is optional and is
    // checked against the branch like any other salesman_id.
    const salesman_id = isSalesman ? req.user.id : (req.body.salesman_id || null);

    if (rate_tier && !VALID_RATE_TIERS.includes(rate_tier))
      return error(res, `rate_tier must be one of: ${VALID_RATE_TIERS.join(', ')}`, 400);

    // Routed through the pgrestGet raw-https bypass (see
    // utils/directQuery.js) — this lookup was still on plain supabase-js,
    // the exact pattern that's intermittently returned a spurious empty
    // result on Railway elsewhere in this codebase, which is what made a
    // real salesman in the right branch come back as "not found".
    const effectiveDriverId = isDriver ? req.user.id : driver_id;
    if (effectiveDriverId) {
      const drivers = await pgrestGet('drivers', {
        select: 'id',
        id: `eq.${effectiveDriverId}`,
        company_id: `eq.${targetCompanyId}`,
      });
      if (!drivers?.[0]) return error(res, 'Driver not found in this branch', 404);
    }

    if (salesman_id) {
      const salesmenRows = await pgrestGet('salesmen', {
        select: 'id',
        id: `eq.${salesman_id}`,
        company_id: `eq.${targetCompanyId}`,
      });
      if (!salesmenRows?.[0]) return error(res, 'Salesman not found in this branch', 404);
    }

    const canonical = normalizePhone(phone);
    const bare = canonical.replace('+', '');
    // Matches on the last 10 digits (the actual subscriber number) rather
    // than an exact string — catches a duplicate even if some other
    // record was stored in a differently-shaped format (e.g. an older
    // row saved before normalizePhone's bare-local-number fix). See
    // utils/phone.js for the full story.
    const last10 = phoneLast10(phone);
    const existingRows = await pgrestGet('users', {
      select: 'id',
      or: `(phone.eq.${canonical},phone.eq.${bare},phone.like.*${last10})`,
    });
    if (existingRows?.[0]) return error(res, 'A customer with this phone number already exists', 400);

    // Same transient Railway<->Supabase blip documented in withRetry.js —
    // this Admin Auth API call isn't a PostgREST table write so it can't
    // use the pgrest bypass, but is exposed to the same occasional
    // failure, which showed up as a raw 500 on Add Customer. One retry
    // papers over the blip; a genuinely duplicate phone still fails
    // every attempt and surfaces as its own clean error below.
    let authData;
    try {
      authData = await withRetry(async () => {
        const { data, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          phone: canonical,
          phone_confirm: true,
          user_metadata: { full_name, role: 'customer' }
        });
        if (authErr) throw new Error(authErr.message);
        return data;
      });
    } catch (authErr) {
      if (/already registered|already exists/i.test(authErr.message || '')) {
        return error(res, 'A customer with this phone number already exists', 400);
      }
      throw authErr;
    }

    const baseRow = {
      id:           authData.user.id,
      company_id:   targetCompanyId,
      role:         'customer',
      full_name,
      phone:        canonical,
      email:        email || null,
      shop_name:    shop_name || null,
      shop_address: shop_address || null,
      shop_image_url:    shop_image_url || null,
      nic_number:        (nic_number && String(nic_number).trim()) || null,
      nic_image_url:     nic_image_url || null,
      nic_back_image_url: nic_back_image_url || null,
      rate_tier:    rate_tier || 'manual',
      driver_id:    effectiveDriverId || null,
      salesman_id:  salesman_id || null,
      is_approved:  true,
      is_active:    true,
      ...(shop_latitude != null && shop_longitude != null
        ? { shop_latitude: Number(shop_latitude), shop_longitude: Number(shop_longitude) }
        : {}),
      ...(credit_limit != null ? { credit_limit: Number(credit_limit) } : {}),
    };

    // city/area are a phase31 addition — fall back to inserting without
    // them if that migration hasn't run yet, same pattern used elsewhere
    // in this codebase for new columns on an already-live table.
    let data;
    try {
      [data] = await pgrestPost('users', { ...baseRow, city: city || null, area: area || null });
    } catch (e) {
      [data] = await pgrestPost('users', baseRow);
    }

    return success(res, data, 'Customer account created', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/:id — edit an existing customer's details
const updateCustomer = async (req, res) => {
  try {
    const { full_name, phone, email, shop_name, shop_address, city, area, shop_latitude, shop_longitude } = req.body;

    const filter = { id: `eq.${req.params.id}`, role: 'eq.customer' };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    // Salesmen can only update customers assigned to them
    if (req.user.role === 'salesman') filter.salesman_id = `eq.${req.user.id}`;

    const baseBody = {
      full_name,
      phone: phone ? normalizePhone(phone) : undefined,
      email,
      shop_name,
      shop_address,
      ...(shop_latitude != null && shop_longitude != null
        ? { shop_latitude: Number(shop_latitude), shop_longitude: Number(shop_longitude) }
        : {}),
    };

    // city/area are a phase31 addition — fall back to patching without
    // them if that migration hasn't run yet.
    let data;
    try {
      data = await pgrestPatch('users', filter, { ...baseBody, city, area });
    } catch (e) {
      data = await pgrestPatch('users', filter, baseBody);
    }
    if (!data?.[0]) return error(res, 'Customer not found or access denied', 404);
    return success(res, data[0], 'Customer updated');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/:id/assign-salesman — assigns (or clears, if
// salesman_id is falsy) which salesman this customer belongs to. Uses
// findScopedCustomer below (defined further down but hoisted as a
// function declaration) so super_admin can assign across any branch
// while branch_admin stays locked to their own.
const assignSalesman = async (req, res) => {
  try {
    const { salesman_id } = req.body;
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    if (salesman_id) {
      // Routed through the raw-https bypass (see utils/directQuery.js) —
      // this was still on plain supabase-js, the exact pattern proven
      // elsewhere in this codebase to silently return an empty/null
      // result on Railway even for a salesman that genuinely exists in
      // this branch, which is what showed up as "Salesman not found in
      // this customer's branch" despite the salesman being right there
      // in the desktop's own branch-filtered dropdown.
      const smRows = await pgrestGet('salesmen', {
        select: 'id',
        id: `eq.${salesman_id}`,
        company_id: `eq.${customer.company_id}`,
      });
      if (!smRows?.[0]) return error(res, 'Salesman not found in this customer\'s branch', 404);
    }

    const data = await pgrestPatch('users', { id: `eq.${customer.id}` }, { salesman_id: salesman_id || null });
    return success(res, data?.[0], salesman_id ? 'Salesman assigned' : 'Salesman unassigned');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/:id/assign-driver — same pattern as
// assignSalesman above, for users.driver_id.
const assignDriver = async (req, res) => {
  try {
    const { driver_id } = req.body;
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    if (driver_id) {
      // Same raw-https bypass fix as assignSalesman above, and for the
      // identical reason.
      const drRows = await pgrestGet('drivers', {
        select: 'id',
        id: `eq.${driver_id}`,
        company_id: `eq.${customer.company_id}`,
      });
      if (!drRows?.[0]) return error(res, 'Driver not found in this customer\'s branch', 404);
    }

    const data = await pgrestPatch('users', { id: `eq.${customer.id}` }, { driver_id: driver_id || null });
    return success(res, data?.[0], driver_id ? 'Driver assigned' : 'Driver unassigned');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/customers/:id — permanent delete: the customer, their
// orders, payments, ledger, custom prices, visits, opening balance and
// login are all removed from the database (see hardDelete.service.js).
// It used to only set is_active=false, which left the row and everything
// attached to it in Supabase. The double-confirmation this backs is
// entirely a frontend concern (see Customers.js).
const deleteCustomer = async (req, res) => {
  try {
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    const removed = await deleteCustomerPermanently(customer.id);
    return success(res, { deleted: true, removed }, 'Customer deleted permanently');
  } catch (err) { return error(res, err.message); }
};

const VALID_RATE_TIERS = ['manual', 'discount', 'premium'];

// PATCH /api/v1/customers/:id/rate-tier — change an already-approved
// customer's pricing tier (see the Rate Tier dialog on approval too, in
// auth.service.js's approveCustomer — same tiers, same effect on
// order_items.unit_price at order-creation time).
const updateRateTier = async (req, res) => {
  try {
    const { rate_tier } = req.body;
    if (!VALID_RATE_TIERS.includes(rate_tier)) {
      return error(res, `rate_tier must be one of: ${VALID_RATE_TIERS.join(', ')}`, 400);
    }

    let query = supabaseAdmin
      .from('users')
      .update({ rate_tier })
      .eq('id', req.params.id)
      .eq('role', 'customer');
    // super_admin can retarget any branch's customer; branch_admin stays
    // locked to their own — same scoping as approveCustomer.
    if (req.user.role !== 'super_admin') query = query.eq('company_id', req.user.company_id);

    const { data, error: dbErr } = await query.select('id, full_name, rate_tier').single();
    if (dbErr) return error(res, 'Customer not found or access denied', 404);
    return success(res, data, 'Rate tier updated');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/:id/credit-limit — max outstanding ledger
// balance (debit running_balance) this customer can carry before
// createOrder starts rejecting new orders. null/0 means no limit —
// see orders.service.js's createOrder credit-limit check.
const updateCreditLimit = async (req, res) => {
  try {
    const { credit_limit } = req.body;
    if (credit_limit != null && (isNaN(Number(credit_limit)) || Number(credit_limit) < 0)) {
      return error(res, 'credit_limit must be a non-negative number or null', 400);
    }

    let query = supabaseAdmin
      .from('users')
      .update({ credit_limit: credit_limit == null ? null : Number(credit_limit) })
      .eq('id', req.params.id)
      .eq('role', 'customer');
    if (req.user.role !== 'super_admin') query = query.eq('company_id', req.user.company_id);

    const { data, error: dbErr } = await query.select('id, full_name, credit_limit').single();
    if (dbErr) return error(res, 'Customer not found or access denied', 404);
    return success(res, data, 'Credit limit updated');
  } catch (err) { return error(res, err.message); }
};

// Resolves the target customer, enforcing the same branch-scoping as
// updateRateTier (super_admin: any branch, branch_admin: own only), and
// returns their company_id — every pricing handler below needs it to
// scope the product catalog.
async function findScopedCustomer(req) {
  let query = supabaseAdmin
    .from('users')
    .select('id, full_name, company_id, salesman_id')
    .eq('id', req.params.id)
    .eq('role', 'customer');
  // A salesman (now allowed on these pricing routes, for setting custom
  // prices on a customer they're registering via the mobile app's own
  // 3-step Add Customer wizard) only ever touches customers assigned to
  // them — same restriction createCustomer already applies when a
  // salesman is the one calling it.
  if (req.user.role === 'salesman') query = query.eq('salesman_id', req.user.id);
  else if (req.user.role === 'driver') query = query.eq('driver_id', req.user.id).eq('company_id', req.user.company_id);
  else if (req.user.role !== 'super_admin') query = query.eq('company_id', req.user.company_id);
  const { data, error: dbErr } = await query.single();
  if (dbErr || !data) return null;
  return data;
}

// GET /api/v1/customers/:id/pricing — every product in the customer's
// branch, with the catalog price and (if one exists) this customer's
// override price for it.
const getCustomerPricing = async (req, res) => {
  try {
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    // Routed through the pgrestGet raw-https bypass (see
    // utils/directQuery.js) — this was still on plain supabase-js, which
    // is what made a custom price look like it "didn't save": the write
    // (setCustomerPricing below) already used this bypass and genuinely
    // succeeded, but reopening the pricing panel re-read overrides via
    // the flaky plain-supabase-js path above and could come back empty.
    const [products, overrides] = await Promise.all([
      pgrestGet('products', {
        select: 'id,name,unit,price,categories(name)',
        company_id: `eq.${customer.company_id}`,
        or: '(is_active.eq.true,is_active.is.null)',
        order: 'name.asc',
      }),
      pgrestGet('customer_product_prices', {
        select: 'product_id,price',
        customer_id: `eq.${customer.id}`,
      }),
    ]);

    const overrideByProduct = Object.fromEntries((overrides || []).map((o) => [o.product_id, Number(o.price)]));
    // Tile Bond first, then Grout, then everything else — same order as
    // every other product listing (see products.service.js).
    const data = sortByMerchandisingOrder(products || []).map((p) => ({
      product_id:    p.id,
      name:          p.name,
      unit:          p.unit,
      category:      p.categories?.name || null,
      catalog_price: Number(p.price),
      custom_price:  overrideByProduct[p.id] ?? null
    }));

    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// PUT /api/v1/customers/:id/pricing/:productId — set/replace this
// customer's override price for one product.
// Routed through the raw-https bypass (see utils/directQuery.js) — this
// was reported failing with what looked like an RLS error on Railway,
// matching the exact same supabase-js write-flakiness signature already
// fixed elsewhere in this codebase (production_orders, dispatches,
// salesmen, raw_materials — never a real RLS issue, since supabaseAdmin
// already bypasses RLS via the service role key). No native upsert over
// this bypass, so this does the same find-then-insert-or-update the rest
// of the codebase already uses (see assignSalesman above).
const setCustomerPricing = async (req, res) => {
  try {
    const { price } = req.body;
    if (price === undefined || price === null || Number(price) < 0) {
      return error(res, 'A non-negative price is required', 400);
    }

    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    // Product must actually belong to the customer's own branch — cheap
    // guard against setting a price for a product from a different company.
    const products = await pgrestGet('products', {
      select: 'id',
      id: `eq.${req.params.productId}`,
      company_id: `eq.${customer.company_id}`,
    });
    if (!products?.[0]) return error(res, 'Product not found in this customer\'s branch', 404);

    const existing = await pgrestGet('customer_product_prices', {
      select: 'id',
      customer_id: `eq.${customer.id}`,
      product_id: `eq.${req.params.productId}`,
    });

    let data;
    if (existing?.[0]) {
      const updated = await pgrestPatch(
        'customer_product_prices',
        { id: `eq.${existing[0].id}` },
        { price: Number(price), updated_at: new Date().toISOString() }
      );
      data = updated?.[0];
    } else {
      const [inserted] = await pgrestPost('customer_product_prices', {
        customer_id: customer.id,
        product_id:  req.params.productId,
        company_id:  customer.company_id,
        price:       Number(price),
      });
      data = inserted;
    }

    return success(res, data, 'Custom price saved');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/customers/:id/pricing/:productId — remove the override,
// reverting that product back to the catalog price (+ rate_tier, if any).
const deleteCustomerPricing = async (req, res) => {
  try {
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    await pgrestDelete('customer_product_prices', {
      customer_id: `eq.${customer.id}`,
      product_id:  `eq.${req.params.productId}`,
    });
    return success(res, { deleted: true }, 'Custom price removed');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/me/location — customer sets their own shop's coordinates
const updateMyShopLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null)
      return error(res, 'latitude and longitude are required', 400);

    // Best-effort — a human-readable address for the admin desktop's
    // "Shop Address" field (which used to just show whatever a customer
    // had typed by hand, often blank or garbage) so it reflects the pin
    // that was actually dropped on the map. Never blocks the coordinate
    // save itself if the lookup fails or times out.
    const shopAddress = await reverseGeocode(latitude, longitude).catch(() => null);

    const updatePayload = { shop_latitude: Number(latitude), shop_longitude: Number(longitude) };
    if (shopAddress) updatePayload.shop_address = shopAddress;

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .update(updatePayload)
      .eq('id', req.user.id)
      .eq('role', 'customer')
      .select('id, shop_latitude, shop_longitude, shop_address')
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Shop location saved');
  } catch (err) { return error(res, err.message); }
};

// A customer's profile is "complete" only once every one of these is
// filled in — checked fresh on every read instead of cached in a column,
// so it self-corrects if a field is ever cleared later. email/shop_address
// used to be required too; the "Complete Your Profile" screen dropped
// them in favor of a shop photo + GPS shop location (shop_image_url /
// shop_latitude / shop_longitude), which this list now reflects.
// whatsapp_phone is the field the UI simply labels "Phone Number".
const REQUIRED_PROFILE_FIELDS = [
  'full_name', 'nic_number', 'shop_name', 'shop_image_url',
  'shop_latitude', 'shop_longitude', 'whatsapp_phone',
  'profile_photo_url', 'nic_image_url', 'nic_back_image_url',
];

function isProfileComplete(user) {
  return REQUIRED_PROFILE_FIELDS.every(
    (f) => user[f] != null && String(user[f]).trim() !== ''
  );
}

// GET /api/v1/customers/me/profile
const getMyProfile = async (req, res) => {
  try {
    const rows = await pgrestGet('users', {
      select: 'id,full_name,phone,email,nic_number,nic_image_url,nic_back_image_url,whatsapp_phone,shop_name,shop_address,shop_image_url,shop_latitude,shop_longitude,profile_photo_url,credit_limit',
      id: `eq.${req.user.id}`,
      role: 'eq.customer',
    });
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/customers/me/salesman — replaces the old live-location
// "Track Salesman" screen with a plain profile card (name, phone,
// photo) — customers no longer see their salesman's position.
const getMySalesman = async (req, res) => {
  try {
    const customerRows = await pgrestGet('users', { select: 'salesman_id', id: `eq.${req.user.id}` });
    const salesmanId = customerRows?.[0]?.salesman_id;
    if (!salesmanId) return success(res, { assigned: false }, 'No salesman assigned yet');

    const salesmanRows = await pgrestGet('salesmen', {
      select: 'id,full_name,phone,profile_photo_url,position',
      id: `eq.${salesmanId}`,
    });
    const salesman = salesmanRows?.[0];
    if (!salesman) return success(res, { assigned: false }, 'Assigned salesman not found');

    return success(res, { assigned: true, salesman });
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/customers/me/profile — self-service, used by both the
// forced first-login "Complete Your Profile" screen and the later "Edit
// Profile" entry point from Settings. All 8 fields are required by the
// frontend before it even calls this, but this only ever writes fields
// actually present in the body so a partial save never blanks the rest.
const updateMyProfile = async (req, res) => {
  try {
    const {
      full_name, email, nic_number, whatsapp_phone,
      shop_name, shop_address, shop_image_url, shop_latitude, shop_longitude,
      profile_photo_url, nic_image_url, nic_back_image_url,
    } = req.body;

    const update = {};
    if (full_name != null)          update.full_name = full_name;
    if (email != null)              update.email = email;
    if (nic_number != null)         update.nic_number = nic_number;
    // Stripped of spaces/dashes no matter what the client sends — same
    // fix already applied to salesmen.routes.js/drivers.routes.js's
    // identical phone field, for consistency (this column isn't the OTP
    // login lookup key for customers, but a cosmetically-grouped value
    // here is still wrong to store).
    if (whatsapp_phone != null)     update.whatsapp_phone = whatsapp_phone.replace(/[\s-]/g, '');
    if (shop_name != null)          update.shop_name = shop_name;
    if (shop_address != null)       update.shop_address = shop_address;
    if (shop_image_url != null)     update.shop_image_url = shop_image_url;
    if (shop_latitude != null)      update.shop_latitude = Number(shop_latitude);
    if (shop_longitude != null)     update.shop_longitude = Number(shop_longitude);
    if (profile_photo_url != null)  update.profile_photo_url = profile_photo_url;
    if (nic_image_url != null)      update.nic_image_url = nic_image_url;
    if (nic_back_image_url != null) update.nic_back_image_url = nic_back_image_url;

    // Same as updateMyShopLocation above — fill shop_address from the
    // dropped pin's coordinates (unless the caller already sent an
    // explicit shop_address) so the admin desktop sees a real address
    // instead of whatever was last typed by hand, which this Complete
    // Profile flow no longer even collects as a text field.
    if (shop_address == null && shop_latitude != null && shop_longitude != null) {
      const geocoded = await reverseGeocode(shop_latitude, shop_longitude).catch(() => null);
      if (geocoded) update.shop_address = geocoded;
    }

    if (Object.keys(update).length === 0) return error(res, 'No fields to update', 400);

    // Same transient Railway<->Supabase blip withRetry.js documents —
    // the customer-facing "Complete Your Profile" save is the one place
    // a raw 500 here is most visible (right after uploading NIC/profile
    // photos), so it's worth the one retry rather than making them redo
    // the whole form.
    const rows = await withRetry(() => pgrestPatch('users', { id: `eq.${req.user.id}`, role: 'eq.customer' }, update));
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) }, 'Profile updated');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/customers/:id/profile-pdf — super_admin only (every city).
// Full customer dossier — every field, profile picture, NIC image — as a
// downloadable PDF for the new "Customer Information" panel.
const downloadCustomerProfilePDF = async (req, res) => {
  try {
    const rows = await pgrestGet('users', {
      select: '*',
      id: `eq.${req.params.id}`,
      role: 'eq.customer',
    });
    const customer = rows?.[0];
    if (!customer) return error(res, 'Customer not found', 404);

    let company = null;
    try {
      const companies = await pgrestGet('companies', { select: 'name', id: `eq.${customer.company_id}` });
      company = companies?.[0] || null;
    } catch (e) { /* best-effort — PDF still works without the company name */ }

    const pdfBuffer = await buildCustomerProfilePDF(customer, company);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="customer-${customer.id}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  getCustomers, getPendingCustomers, getCustomerById, updateMyShopLocation, updateRateTier, updateCreditLimit,
  getCustomerPricing, setCustomerPricing, deleteCustomerPricing,
  createCustomer, updateCustomer, assignSalesman, assignDriver, deleteCustomer,
  getMyProfile, updateMyProfile, downloadCustomerProfilePDF, getMySalesman,
};
