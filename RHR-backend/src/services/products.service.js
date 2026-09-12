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

// Finished-goods in/out/closing-balance report. "IN" comes from completed
// production runs crediting this product (productions.finished_item_id —
// see runProduction in production.controller.js), "OUT" from quantities
// sold on customer orders (order_items, via each order's created_at for
// date filtering — order_items itself carries no date/company_id of its
// own). "Closing balance" is simply the product's current stock_quantity,
// which is the live running total both of those already feed into — not
// derived by summing history, so it's always correct even if in/out
// logging gaps ever existed.
async function getStockReport({ companyId, from, to }) {
  const { data: products, error: pErr } = await supabaseAdmin
    .from('products')
    .select('id, name, unit, stock_quantity, categories(name)')
    .eq('company_id', companyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (pErr) throw new Error(pErr.message);

  let ordersQuery = supabaseAdmin
    .from('orders')
    .select('created_at, order_items(product_id, quantity)')
    .eq('company_id', companyId);
  if (from) ordersQuery = ordersQuery.gte('created_at', from);
  if (to)   ordersQuery = ordersQuery.lte('created_at', `${to}T23:59:59`);
  const { data: orders, error: oErr } = await ordersQuery;
  if (oErr) throw new Error(oErr.message);

  const outByProduct = {};
  (orders || []).forEach((o) => {
    (o.order_items || []).forEach((item) => {
      outByProduct[item.product_id] = (outByProduct[item.product_id] || 0) + Number(item.quantity);
    });
  });

  let runsQuery = supabaseAdmin
    .from('productions')
    .select('finished_item_id, qty_produced, date')
    .eq('company_id', companyId);
  if (from) runsQuery = runsQuery.gte('date', from);
  if (to)   runsQuery = runsQuery.lte('date', to);
  const { data: runs, error: rErr } = await runsQuery;
  if (rErr) throw new Error(rErr.message);

  const inByProduct = {};
  (runs || []).forEach((r) => {
    if (!r.finished_item_id) return;
    inByProduct[r.finished_item_id] = (inByProduct[r.finished_item_id] || 0) + Number(r.qty_produced);
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    category: p.categories?.name || null,
    stockIn: inByProduct[p.id] || 0,
    stockOut: outByProduct[p.id] || 0,
    closingBalance: Number(p.stock_quantity)
  }));
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct, getStockReport };
