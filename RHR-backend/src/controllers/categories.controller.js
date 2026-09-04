const svc = require('../services/categories.service');
const { success, error } = require('../utils/response');

// Same per-branch scoping as products.controller.js — each branch has its
// own category list (they were seeded identically into all 3 companies,
// which is why the Products page was showing every category name 3x).
function resolveCompanyId(req) {
  if (req.user.role === 'super_admin') return req.query.company_id || req.user.company_id || null;
  return req.user.company_id;
}

const getCategories = async (req, res) => {
  try {
    const data = await svc.getCategories(resolveCompanyId(req));
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const createCategory = async (req, res) => {
  try {
    const { name, company_id } = req.body;
    if (!name) return error(res, 'name is required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    const data = await svc.createCategory(name, targetCompanyId);
    return success(res, data, 'Category created', 201);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getCategories, createCategory };
