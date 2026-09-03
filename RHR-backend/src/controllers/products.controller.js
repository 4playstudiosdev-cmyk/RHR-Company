const svc = require('../services/products.service');
const { success, error } = require('../utils/response');

// KHI is the master product catalog — every branch (KHI/HYD/SUK) reads,
// creates, edits and deletes against this one company_id instead of
// req.user.company_id, so all branches see and manage the same product
// list rather than each branch silently maintaining its own.
const MASTER_CATALOG_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

const getProducts = async (req, res) => {
  try {
    const { category_id, search, page, limit } = req.query;
    const data = await svc.getProducts({ companyId: MASTER_CATALOG_COMPANY_ID, categoryId: category_id, search, page, limit });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getProductById = async (req, res) => {
  try {
    const data = await svc.getProductById(req.params.id, MASTER_CATALOG_COMPANY_ID);
    return success(res, data);
  } catch (err) { return error(res, err.message, 404); }
};

const createProduct = async (req, res) => {
  try {
    const { name, description, sku, price, stock_quantity, unit, category_id, image_url } = req.body;
    if (!name || !price) return error(res, 'name and price are required', 400);
    const data = await svc.createProduct({
      name, description, sku, price, stock_quantity: stock_quantity || 0,
      unit, category_id, image_url,
      company_id: MASTER_CATALOG_COMPANY_ID
    });
    return success(res, data, 'Product created', 201);
  } catch (err) { return error(res, err.message); }
};

const updateProduct = async (req, res) => {
  try {
    const data = await svc.updateProduct(req.params.id, MASTER_CATALOG_COMPANY_ID, req.body);
    return success(res, data, 'Product updated');
  } catch (err) { return error(res, err.message, 404); }
};

const updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return error(res, 'quantity is required', 400);
    const data = await svc.updateStock(req.params.id, MASTER_CATALOG_COMPANY_ID, quantity);
    return success(res, data, 'Stock updated');
  } catch (err) { return error(res, err.message, 404); }
};

const deleteProduct = async (req, res) => {
  try {
    const data = await svc.deleteProduct(req.params.id, MASTER_CATALOG_COMPANY_ID);
    return success(res, data, 'Product deleted');
  } catch (err) { return error(res, err.message, 404); }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct };
