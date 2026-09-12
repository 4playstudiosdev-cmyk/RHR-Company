const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');

const getCustomers = async (req, res) => {
  try {
    const user = req.user;
    let query  = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, is_approved, salesman_id, shop_name, shop_address, shop_latitude, shop_longitude, rate_tier, created_at')
      .eq('role', 'customer')
      .eq('is_active', true);

    // Salesman sees only his assigned customers
    if (user.role === 'salesman') {
      query = query.eq('salesman_id', user.id);
    } else {
      const companyId = resolveCompanyId(req);
      if (companyId) query = query.eq('company_id', companyId);
    }

    const { data, error: dbError } = await query.order('full_name');
    if (dbError) throw new Error(dbError.message);
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

    const [{ data: products, error: pErr }, { data: overrides, error: oErr }] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('id, name, unit, price, categories(name)')
        .eq('company_id', customer.company_id)
        .or('is_active.eq.true,is_active.is.null')
        .order('name'),
      supabaseAdmin
        .from('customer_product_prices')
        .select('product_id, price')
        .eq('customer_id', customer.id)
    ]);
    if (pErr) throw new Error(pErr.message);
    if (oErr) throw new Error(oErr.message);

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
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', req.params.productId)
      .eq('company_id', customer.company_id)
      .maybeSingle();
    if (!product) return error(res, 'Product not found in this customer\'s branch', 404);

    const { data, error: dbErr } = await supabaseAdmin
      .from('customer_product_prices')
      .upsert({
        customer_id: customer.id,
        product_id:  req.params.productId,
        company_id:  customer.company_id,
        price:       Number(price),
        updated_at:  new Date().toISOString()
      }, { onConflict: 'customer_id,product_id' })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Custom price saved');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/customers/:id/pricing/:productId — remove the override,
// reverting that product back to the catalog price (+ rate_tier, if any).
const deleteCustomerPricing = async (req, res) => {
  try {
    const customer = await findScopedCustomer(req);
    if (!customer) return error(res, 'Customer not found or access denied', 404);

    const { error: dbErr } = await supabaseAdmin
      .from('customer_product_prices')
      .delete()
      .eq('customer_id', customer.id)
      .eq('product_id', req.params.productId);

    if (dbErr) throw new Error(dbErr.message);
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

module.exports = {
  getCustomers, getPendingCustomers, getCustomerById, updateMyShopLocation, updateRateTier,
  getCustomerPricing, setCustomerPricing, deleteCustomerPricing
};
