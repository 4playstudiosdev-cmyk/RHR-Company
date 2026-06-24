const svc = require('../services/products.service');
const { success, error } = require('../utils/response');

const getProducts = async (req, res) => {
  try {
    const { category_id, search, page, limit } = req.query;
    const companyId = req.user.company_id;
    const data = await svc.getProducts({ companyId, categoryId: category_id, search, page, limit });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getProductById = async (req, res) => {
  try {
    const data = await svc.getProductById(req.params.id, req.user.company_id);
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
      company_id: req.user.company_id
    });
    return success(res, data, 'Product created', 201);
  } catch (err) { return error(res, err.message); }
};

const updateProduct = async (req, res) => {
  try {
    const data = await svc.updateProduct(req.params.id, req.user.company_id, req.body);
    return success(res, data, 'Product updated');
  } catch (err) { return error(res, err.message, 404); }
};

const updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return error(res, 'quantity is required', 400);
    const data = await svc.updateStock(req.params.id, req.user.company_id, quantity);
    return success(res, data, 'Stock updated');
  } catch (err) { return error(res, err.message, 404); }
};

const deleteProduct = async (req, res) => {
  try {
    const data = await svc.deleteProduct(req.params.id, req.user.company_id);
    return success(res, data, 'Product deleted');
  } catch (err) { return error(res, err.message, 404); }
};

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct };
