const svc = require('../services/products.service');
const { success, error } = require('../utils/response');
const { pgrestGet } = require('../utils/directQuery');
const { featuresOf } = require('../middleware/feature.middleware');

// Each branch (KHI/HYD/SUK) keeps its own product catalog and stock —
// everyone (customer, salesman, branch_admin) is scoped to their own
// company_id. super_admin defaults to their own branch too (so their view
// isn't every branch's rows merged together), but can look at any other
// branch by passing ?company_id= — a camera feed they switch, not a
// blended view. Only falls through to "see everything" if a super_admin
// account has no home branch of its own.
function resolveCompanyId(req) {
  if (req.user.role === 'super_admin') return req.query.company_id || req.user.company_id || null;
  return req.user.company_id;
}

// Whose rate-tier / custom prices get baked into `price`:
//  - a customer browsing: always their own;
//  - a salesman (or admin) placing an order for a customer: that customer,
//    passed as ?customer_id= — otherwise the order screen showed the plain
//    catalog price while the server (createOrder) charged the customer's
//    own rate. The customer must be a real customer in the requester's
//    branch (super_admin: any branch).
//  - no customer_id: plain catalog price, as on the desktop Products page.
async function pricingCustomerId(req) {
  if (req.user.role === 'customer') return req.user.id;
  const requested = req.query.customer_id;
  if (!requested || !['salesman', 'driver', 'branch_admin', 'super_admin'].includes(req.user.role)) return undefined;
  // a driver only gets customer pricing with sales access switched on
  if (req.user.role === 'driver' && !(await featuresOf(req.user))?.sales_access) return undefined;
  const rows = await pgrestGet('users', { select: 'id,company_id', id: `eq.${requested}`, role: 'eq.customer' });
  const customer = rows?.[0];
  if (!customer) return undefined;
  if (req.user.role !== 'super_admin' && customer.company_id !== req.user.company_id) return undefined;
  return customer.id;
}

const getProducts = async (req, res) => {
  try {
    const { category_id, search, page, limit } = req.query;
    const customerId = await pricingCustomerId(req);
    const data = await svc.getProducts({ companyId: resolveCompanyId(req), categoryId: category_id, search, page, limit, customerId });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getProductById = async (req, res) => {
  try {
    const customerId = await pricingCustomerId(req);
    const data = await svc.getProductById(req.params.id, resolveCompanyId(req), customerId);
    return success(res, data);
  } catch (err) { return error(res, err.message, 404); }
};

const createProduct = async (req, res) => {
  try {
    const { name, description, sku, price, stock_quantity, unit, category_id, image_url, company_id } = req.body;
    if (!name || !price) return error(res, 'name and price are required', 400);

    // branch_admin always creates into their own branch. super_admin can
    // target a specific branch by passing company_id, otherwise falls
    // back to their own (keeps the existing Products page working as-is
    // for the super_admin account that already has a home branch).
    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    const data = await svc.createProduct({
      name, description, sku, price, stock_quantity: stock_quantity || 0,
      unit, category_id, image_url,
      company_id: targetCompanyId
    });
    return success(res, data, 'Product created', 201);
  } catch (err) { return error(res, err.message); }
};

const updateProduct = async (req, res) => {
  try {
    // super_admin can edit any branch's product — don't lock them to their
    // own company_id, otherwise editing a HYD/SUK product while logged in
    // as KHI super_admin always fails ("product not found"). Only apply the
    // company_id filter when an explicit ?company_id= is given in the query
    // (which the frontend never sends on a PUT, so this is super_admin-only).
    // branch_admin stays scoped to their own branch as before.
    const companyId = req.user.role === 'super_admin'
      ? (req.query.company_id || null)
      : req.user.company_id;
    const data = await svc.updateProduct(req.params.id, companyId, req.body);
    return success(res, data, 'Product updated');
  } catch (err) { return error(res, err.message, 404); }
};

const updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return error(res, 'quantity is required', 400);
    const companyId = req.user.role === 'super_admin'
      ? (req.query.company_id || null)
      : req.user.company_id;
    const data = await svc.updateStock(req.params.id, companyId, quantity);
    return success(res, data, 'Stock updated');
  } catch (err) { return error(res, err.message, 404); }
};

const deleteProduct = async (req, res) => {
  try {
    const companyId = req.user.role === 'super_admin'
      ? (req.query.company_id || null)
      : req.user.company_id;
    const data = await svc.deleteProduct(req.params.id, companyId);
    return success(res, data, 'Product deleted');
  } catch (err) { return error(res, err.message, 404); }
};

// GET /api/v1/products/reports/stock — in/out/closing balance per product
const getStockReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return error(res, 'company_id is required', 400);
    const data = await svc.getStockReport({ companyId, from, to });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct, getStockReport };
