const svc = require('../services/categories.service');
const { success, error } = require('../utils/response');

const getCategories = async (req, res) => {
  try {
    const data = await svc.getCategories();
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return error(res, 'name is required', 400);
    const data = await svc.createCategory(name);
    return success(res, data, 'Category created', 201);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getCategories, createCategory };
