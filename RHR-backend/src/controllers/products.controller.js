const svc = require('../services/products.service');
const { success, error } = require('../utils/response');

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

const getProducts = async (req, res) => {
  try {
    const { category_id, search, page, limit } = req.query;
    const data = await svc.getProducts({ companyId: resolveCompanyId(req), categoryId: category_id, search, page, limit });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getProductById = async (req, res) => {
  try {
    const data = await svc.getProductById(req.params.id, resolveCompanyId(req));
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
    const data = await svc.updateProduct(req.params.id, resolveCompanyId(req), req.body);
    return success(res, data, 'Product updated');
  } catch (err) { return error(res, err.message, 404); }
};

const updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return error(res, 'quantity is required', 400);
    const data = await svc.updateStock(req.params.id, resolveCompanyId(req), quantity);
    return success(res, data, 'Stock updated');
  } catch (err) { return error(res, err.message, 404); }
};

const deleteProduct = async (req, res) => {
  try {
    const data = await svc.deleteProduct(req.params.id, resolveCompanyId(req));
    return success(res, data, 'Product deleted');
  } catch (err) { return error(res, err.message, 404); }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct };
