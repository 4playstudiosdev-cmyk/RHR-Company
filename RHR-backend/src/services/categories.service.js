const { pgrestGet, pgrestPost } = require('../utils/directQuery');

// Routed through the pgrestGet/pgrestPost raw-https bypass (see
// utils/directQuery.js) instead of plain supabase-js — same Railway
// flakiness that made the Add Product category dropdown come back empty
// for Hyderabad/Sukkur even though their categories exist in the DB.

async function getCategories(companyId) {
  const params = { select: 'id,name', order: 'name.asc' };
  if (companyId) params.company_id = `eq.${companyId}`;
  const data = await pgrestGet('categories', params);
  return data || [];
}

async function createCategory(name, companyId) {
  const [data] = await pgrestPost('categories', { name, company_id: companyId });
  return data;
}

module.exports = { getCategories, createCategory };
