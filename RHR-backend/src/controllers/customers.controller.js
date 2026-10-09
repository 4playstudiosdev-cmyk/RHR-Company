const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  return '+' + digits;
}

// city/area are a phase31 addition — the named-column select below 400s
// outright if that migration hasn't run (unlike select('*'), which just
// omits missing columns), so this tries with them first and falls back
// to the old column list rather than breaking the whole Customers page.
const CUSTOMER_COLUMNS = 'id, company_id, full_name, phone, email, is_approved, salesman_id, driver_id, shop_name, shop_address, shop_latitude, shop_longitude, rate_tier, city, area, created_at';
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
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getPendingCustomers = async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, shop_name, created_at')
      .eq('role', 'customer')
      .eq('is_approved', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    const companyId = resolveCompanyId(req);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getCustomerById = async (req, res) => {
  try {
    const user = req.user;
    let query  = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, is_approved, salesman_id, company_id, shop_name, shop_address, shop_latitude, shop_longitude, created_at')
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
    const { full_name, phone, email, shop_name, shop_address, city, area, company_id, rate_tier, driver_id, salesman_id } = req.body;
    if (!full_name || !phone)
      return error(res, 'full_name and phone are required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    if (rate_tier && !VALID_RATE_TIERS.includes(rate_tier))
      return error(res, `rate_tier must be one of: ${VALID_RATE_TIERS.join(', ')}`, 400);

    // Routed through the pgrestGet raw-https bypass (see
    // utils/directQuery.js) — this lookup was still on plain supabase-js,
    // the exact pattern that's intermittently returned a spurious empty
    // result on Railway elsewhere in this codebase, which is what made a
    // real salesman in the right branch come back as "not found".
    if (driver_id) {
      const drivers = await pgrestGet('drivers', {
        select: 'id',
        id: `eq.${driver_id}`,
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
    const existingRows = await pgrestGet('users', {
      select: 'id',
      or: `(phone.eq.${canonical},phone.eq.${bare})`,
    });
    if (existingRows?.[0]) return error(res, 'A customer with this phone number already exists', 400);

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      phone: canonical,
      phone_confirm: true,
      user_metadata: { full_name, role: 'customer' }
    });
    if (authErr) throw new Error(authErr.message);

    const baseRow = {
      id:           authData.user.id,
      company_id:   targetCompanyId,
      role:         'customer',
      full_name,
      phone:        canonical,
      email:        email || null,
      shop_name:    shop_name || null,
      shop_address: shop_address || null,
      rate_tier:    rate_tier || 'manual',
      driver_id:    driver_id || null,
      salesman_id:  salesman_id || null,
      is_approved:  true,
      is_active:    true
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
    const { full_name, phone, email, shop_name, shop_address, city, area } = req.body;

    const filter = { id: `eq.${req.params.id}`, role: 'eq.customer' };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const baseBody = {
      full_name,
      phone: phone ? normalizePhone(phone) : undefined,
      email,
      shop_name,
      shop_address
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
      const { data: sm } = await supabaseAdmin
        .from('salesmen')
        .select('id')
        .eq('id', salesman_id)
        .eq('company_id', customer.company_id)
        .maybeSingle();
      if (!sm) return error(res, 'Salesman not found in this customer\'s branch', 404);
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
      const { data: dr } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('id', driver_id)
        .eq('company_id', customer.company_id)
        .maybeSingle();
      if (!dr) return error(res, 'Driver not found in this customer\'s branch', 404);
    }

    const data = await pgrestPatch('users', { id: `eq.${customer.id}` }, { driver_id: driver_id || null });
    return success(res, data?.[0], driver_id ? 'Driver assigned' : 'Driver unassigned');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/customers/:id — soft delete (is_active: false), same
// convention as Salesmen/Drivers/Employees. The double-confirmation
// this backs is entirely a frontend concern (see Customers.js).
const deleteCustomer = async (req, res) => {
  try {
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    await pgrestPatch('users', { id: `eq.${customer.id}` }, { is_active: false });
    return success(res, { deleted: true }, 'Customer deleted');
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

// Resolves the target customer, enforcing the same branch-scoping as
// updateRateTier (super_admin: any branch, branch_admin: own only), and
// returns their company_id — every pricing handler below needs it to
// scope the product catalog.
async function findScopedCustomer(req) {
  let query = supabaseAdmin
    .from('users')
    .select('id, full_name, company_id')
    .eq('id', req.params.id)
    .eq('role', 'customer');
  if (req.user.role !== 'super_admin') query = query.eq('company_id', req.user.company_id);
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
    const data = (products || []).map((p) => ({
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

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .update({ shop_latitude: Number(latitude), shop_longitude: Number(longitude) })
      .eq('id', req.user.id)
      .eq('role', 'customer')
      .select('id, shop_latitude, shop_longitude')
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Shop location saved');
  } catch (err) { return error(res, err.message); }
};

// A customer's profile is "complete" only once every one of these is
// filled in — checked fresh on every read instead of cached in a column,
// so it self-corrects if a field is ever cleared later.
const REQUIRED_PROFILE_FIELDS = [
  'full_name', 'email', 'nic_number', 'shop_name',
  'shop_address', 'whatsapp_phone', 'profile_photo_url', 'nic_image_url',
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
      select: 'id,full_name,phone,email,nic_number,nic_image_url,whatsapp_phone,shop_name,shop_address,profile_photo_url',
      id: `eq.${req.user.id}`,
      role: 'eq.customer',
    });
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) });
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
      shop_name, shop_address, profile_photo_url, nic_image_url,
    } = req.body;

    const update = {};
    if (full_name != null)         update.full_name = full_name;
    if (email != null)             update.email = email;
    if (nic_number != null)        update.nic_number = nic_number;
    if (whatsapp_phone != null)    update.whatsapp_phone = whatsapp_phone;
    if (shop_name != null)         update.shop_name = shop_name;
    if (shop_address != null)      update.shop_address = shop_address;
    if (profile_photo_url != null) update.profile_photo_url = profile_photo_url;
    if (nic_image_url != null)     update.nic_image_url = nic_image_url;

    if (Object.keys(update).length === 0) return error(res, 'No fields to update', 400);

    const rows = await pgrestPatch('users', { id: `eq.${req.user.id}`, role: 'eq.customer' }, update);
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) }, 'Profile updated');
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  getCustomers, getPendingCustomers, getCustomerById, updateMyShopLocation, updateRateTier,
  getCustomerPricing, setCustomerPricing, deleteCustomerPricing,
  createCustomer, updateCustomer, assignSalesman, assignDriver, deleteCustomer,
  getMyProfile, updateMyProfile,
};
