const { supabaseAdmin } = require('../config/supabase');

async function getProducts({ companyId, categoryId, search, page=1, limit=20 }) {
  let query = supabaseAdmin
    .from('products')
    .select('*, categories(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');

  if (categoryId) query = query.eq('category_id', categoryId);
  if (search)     query = query.ilike('name', `%${search}%`);

  // Pagination
  const from = (page - 1) * limit;
  const to   = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { products: data, total: count, page, limit };
}

async function getProductById(id, companyId) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*, categories(name)')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();
  if (error) throw new Error('Product not found');
  return data;
}

async function createProduct(productData) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert(productData)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateProduct(id, companyId, updates) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();
  if (error) throw new Error('Product not found or access denied');
  return data;
}

async function updateStock(id, companyId, quantity) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ stock_quantity: quantity })
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();
  if (error) throw new Error('Product not found');
  return data;
}

async function deleteProduct(id, companyId) {
  const { error } = await supabaseAdmin
    .from('products')
    .update({ is_active: false })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw new Error('Product not found');
  return { deleted: true };
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct };
