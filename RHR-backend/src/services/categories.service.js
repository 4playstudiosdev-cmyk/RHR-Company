const { supabaseAdmin } = require('../config/supabase');

async function getCategories(companyId) {
  let query = supabaseAdmin
    .from('categories')
    .select('id, name')
    .order('name');
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function createCategory(name, companyId) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({ name, company_id: companyId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { getCategories, createCategory };
