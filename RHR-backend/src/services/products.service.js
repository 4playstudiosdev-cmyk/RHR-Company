const { supabaseAdmin } = require('../config/supabase');

async function getProducts({ companyId, categoryId, search, page=1, limit=20 }) {
  let query = supabaseAdmin
    .from('products')
    .select('*, categories(name)', { count: 'exact' })
    .or('is_active.eq.true,is_active.is.null')
    .order('name');

  if (companyId)  query = query.eq('company_id', companyId);
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
  let query = supabaseAdmin
    .from('products')
    .select('*, categories(name)')
    .eq('id', id)
    .or('is_active.eq.true,is_active.is.null');
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query.single();
  if (error) throw new Error('Product not found');
  return data;
}

async function createProduct(productData) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({ ...productData, is_active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateProduct(id, companyId, updates) {
  let query = supabaseAdmin.from('products').update(updates).eq('id', id);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query.select().single();
  if (error) throw new Error('Product not found or access denied');
  return data;
}

async function updateStock(id, companyId, quantity) {
  let query = supabaseAdmin.from('products').update({ stock_quantity: quantity }).eq('id', id);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query.select().single();
  if (error) throw new Error('Product not found');
  return data;
}

async function deleteProduct(id, companyId) {
  let query = supabaseAdmin.from('products').update({ is_active: false }).eq('id', id);
  if (companyId) query = query.eq('company_id', companyId);
  const { error } = await query;
  if (error) throw new Error('Product not found');
  return { deleted: true };
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct };
