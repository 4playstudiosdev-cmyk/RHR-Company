const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// Routed entirely through the pgrestGet/pgrestPost/pgrestPatch raw-https
// bypass (see utils/directQuery.js) instead of plain supabase-js — this
// file was never migrated for the documented Railway/supabase-js bug
// (silent empty reads, "RLS violation"-looking write failures), which is
// what made product creation and the category dropdown work for Karachi
// (presumably by chance/timing) and fail for Hyderabad/Sukkur.

async function getProducts({ companyId, categoryId, search, page = 1, limit = 20 }) {
  const params = {
    select: '*,categories(name)',
    or: '(is_active.eq.true,is_active.is.null)',
    order: 'name.asc',
    offset: String((page - 1) * limit),
    limit: String(limit),
  };
  if (companyId)  params.company_id = `eq.${companyId}`;
  if (categoryId) params.category_id = `eq.${categoryId}`;
  if (search)     params.name = `ilike.*${search}*`;

  const data = await pgrestGet('products', params);
  return { products: data || [], total: (data || []).length, page, limit };
}

async function getProductById(id, companyId) {
  const params = {
    select: '*,categories(name)',
    id: `eq.${id}`,
    or: '(is_active.eq.true,is_active.is.null)',
  };
  if (companyId) params.company_id = `eq.${companyId}`;
  const rows = await pgrestGet('products', params);
  if (!rows?.[0]) throw new Error('Product not found');
  return rows[0];
}

async function createProduct(productData) {
  const [data] = await pgrestPost('products', { ...productData, is_active: true });
  return data;
}

async function updateProduct(id, companyId, updates) {
  const filter = { id: `eq.${id}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const data = await pgrestPatch('products', filter, updates);
  if (!data?.[0]) throw new Error('Product not found or access denied');
  return data[0];
}

async function updateStock(id, companyId, quantity) {
  const filter = { id: `eq.${id}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const data = await pgrestPatch('products', filter, { stock_quantity: quantity });
  if (!data?.[0]) throw new Error('Product not found');
  return data[0];
}

async function deleteProduct(id, companyId) {
  const filter = { id: `eq.${id}` };
  if (companyId) filter.company_id = `eq.${companyId}`;
  const data = await pgrestPatch('products', filter, { is_active: false });
  if (!data?.[0]) throw new Error('Product not found');
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
  const products = await pgrestGet('products', {
    select: 'id,name,unit,stock_quantity,categories(name)',
    company_id: `eq.${companyId}`,
    or: '(is_active.eq.true,is_active.is.null)',
    order: 'name.asc',
  });

  const orderParams = {
    select: 'created_at,order_items(product_id,quantity)',
    company_id: `eq.${companyId}`,
  };
  if (from) orderParams.created_at = `gte.${from}`;
  let orders = await pgrestGet('orders', orderParams);
  if (to) orders = (orders || []).filter((o) => o.created_at <= `${to}T23:59:59`);

  const outByProduct = {};
  (orders || []).forEach((o) => {
    (o.order_items || []).forEach((item) => {
      outByProduct[item.product_id] = (outByProduct[item.product_id] || 0) + Number(item.quantity);
    });
  });

  const runParams = {
    select: 'finished_item_id,qty_produced,date',
    company_id: `eq.${companyId}`,
  };
  if (from) runParams.date = `gte.${from}`;
  let runs = await pgrestGet('productions', runParams);
  if (to) runs = (runs || []).filter((r) => r.date <= to);

  const inByProduct = {};
  (runs || []).forEach((r) => {
    if (!r.finished_item_id) return;
    inByProduct[r.finished_item_id] = (inByProduct[r.finished_item_id] || 0) + Number(r.qty_produced);
  });

  return (products || []).map((p) => ({
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
