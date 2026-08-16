const { supabaseAdmin } = require('../config/supabase');

async function getCategories() {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

async function createCategory(name) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { getCategories, createCategory };
