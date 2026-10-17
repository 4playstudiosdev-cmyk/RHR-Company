const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// Fixed merchandising order every product listing (customer catalogue,
// salesman New Order/Products browse, admin Products/Orders) should lead
// with — top sellers first, grouped by line, with each product's own
// weight variants (e.g. Patlo Sealer 1KG/2KG/5KG/10KG) immediately
// following it rather than scattered alphabetically. Matched by prefix
// (lowercased) so a variant's weight suffix, or a product name that's
// grown a bit (e.g. "Readicam Tile Bond" vs "...100% Quality"), still
// lands in the right slot. Anything not listed here keeps its existing
// relative order, appended after everything that is.
const PRODUCT_PRIORITY_PREFIXES = [
  'readymix tile bond 150%',
  'readicam tile bond',
  'stylo plus tile bond',
  'total tile bond',
  'tile stone bond',
  'super sonex tile bond',
  'sani star tile bond',
  'super stylo tile bond',
  'easy fix tile bond',
  'strong hi-mix bond',
  'new stylish grout',
  'total tile grout',
  'strong hi-mix grout',
  'aqua shield',
  'readymix patlo',
  'patlo sealer',
  'mapro white cement',
  'mapro gray cement',
  'plaster of paris',
];

// Category comes first: every Tile Bond product, then every Grout
// product, then everything else — same order as the category tabs. Matched
// by name fragment, like orderQtyRules.js, so it works per branch.
function categoryRank(product) {
  const c = String(product.categories?.name || '').toLowerCase();
  if (c.includes('tile bond')) return 0;
  if (c.includes('grout')) return 1;
  return 2;
}

function sortByMerchandisingOrder(products) {
  const indexed = products.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => {
    const catA = categoryRank(a.p);
    const catB = categoryRank(b.p);
    if (catA !== catB) return catA - catB;
    const nameA = (a.p.name || '').toLowerCase();
    const nameB = (b.p.name || '').toLowerCase();
    const prioA = PRODUCT_PRIORITY_PREFIXES.findIndex((prefix) => nameA.startsWith(prefix));
    const prioB = PRODUCT_PRIORITY_PREFIXES.findIndex((prefix) => nameB.startsWith(prefix));
    const rankA = prioA === -1 ? PRODUCT_PRIORITY_PREFIXES.length : prioA;
    const rankB = prioB === -1 ? PRODUCT_PRIORITY_PREFIXES.length : prioB;
    if (rankA !== rankB) return rankA - rankB;
    if (rankA === PRODUCT_PRIORITY_PREFIXES.length) return a.i - b.i; // unlisted: keep original order
    // Same priority slot (e.g. two weight variants of the same line) —
    // smaller weight first (1KG before 5KG), falling back to original order.
    const weightA = parseInt((nameA.match(/(\d+)\s*kg/) || [])[1], 10) || 0;
    const weightB = parseInt((nameB.match(/(\d+)\s*kg/) || [])[1], 10) || 0;
    if (weightA !== weightB) return weightA - weightB;
    return a.i - b.i;
  });
  return indexed.map((x) => x.p);
}

// Routed entirely through the pgrestGet/pgrestPost/pgrestPatch raw-https
// bypass (see utils/directQuery.js) instead of plain supabase-js — this
// file was never migrated for the documented Railway/supabase-js bug
// (silent empty reads, "RLS violation"-looking write failures), which is
// what made product creation and the category dropdown work for Karachi
// (presumably by chance/timing) and fail for Hyderabad/Sukkur.

// Same flat-PKR-10 rate-tier adjustment and per-customer custom-price
// override orders.service.js's createOrder actually charges — mirrored
// here so a customer browsing the catalogue sees the exact price they'll
// be charged, instead of always seeing the plain catalog price and only
// finding out about their discount/custom rate once an order is placed.
const RATE_TIER_ADJUSTMENT = { manual: 0, discount: -10, premium: 10 };

async function applyCustomerPricing(products, customerId) {
  if (!customerId || !products.length) return products;
  const [customerRows, customPrices] = await Promise.all([
    pgrestGet('users', { select: 'rate_tier', id: `eq.${customerId}` }),
    pgrestGet('customer_product_prices', {
      select: 'product_id,price',
      customer_id: `eq.${customerId}`,
      product_id: `in.(${products.map(p => p.id).join(',')})`,
    }),
  ]);
  const tierAdjustment = RATE_TIER_ADJUSTMENT[customerRows?.[0]?.rate_tier] || 0;
  const customPriceByProduct = Object.fromEntries((customPrices || []).map(c => [c.product_id, Number(c.price)]));
  return products.map(p => ({
    ...p,
    catalog_price: Number(p.price),
    price: p.id in customPriceByProduct
      ? customPriceByProduct[p.id]
      : Math.max(0, Number(p.price) + tierAdjustment),
  }));
}

async function getProducts({ companyId, categoryId, search, page = 1, limit = 20, customerId }) {
  const params = {
    select: '*,categories(name)',
    or: '(is_active.eq.true,is_active.is.null)',
    order: 'name.asc',
  };
  if (companyId)  params.company_id = `eq.${companyId}`;
  if (categoryId) params.category_id = `eq.${categoryId}`;
  if (search)     params.name = `ilike.*${search}*`;

  // Sorted in-app (not via the DB `order`) to apply the fixed
  // merchandising order above, which a plain `ORDER BY name` can't
  // express — fetched in full first (this catalog is small enough per
  // branch that "all of it" and "a page of it" are the same cost) so the
  // sort sees every row before the requested page gets sliced off.
  const all = sortByMerchandisingOrder(await pgrestGet('products', params) || []);
  const start = (page - 1) * limit;
  const pageOfProducts = await applyCustomerPricing(all.slice(start, start + limit), customerId);
  return { products: pageOfProducts, total: all.length, page, limit };
}

async function getProductById(id, companyId, customerId) {
  const params = {
    select: '*,categories(name)',
    id: `eq.${id}`,
    or: '(is_active.eq.true,is_active.is.null)',
  };
  if (companyId) params.company_id = `eq.${companyId}`;
  const rows = await pgrestGet('products', params);
  if (!rows?.[0]) throw new Error('Product not found');
  const [priced] = await applyCustomerPricing([rows[0]], customerId);
  return priced;
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
// own). "Closing balance" must reflect stock as of the end of `to`, not
// live current stock_quantity — so when `to` is a past date, the balance
// is rolled back by whatever IN/OUT happened strictly after `to`.
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

  // Roll the live stock_quantity back by whatever IN/OUT happened strictly
  // after `to`, so picking a past date doesn't still show today's balance.
  const netAfterByProduct = {};
  if (to) {
    const laterOrders = await pgrestGet('orders', {
      select: 'created_at,order_items(product_id,quantity)',
      company_id: `eq.${companyId}`,
      created_at: `gt.${to}T23:59:59`,
    });
    (laterOrders || []).forEach((o) => {
      (o.order_items || []).forEach((item) => {
        netAfterByProduct[item.product_id] = (netAfterByProduct[item.product_id] || 0) - Number(item.quantity);
      });
    });

    const laterRuns = await pgrestGet('productions', {
      select: 'finished_item_id,qty_produced,date',
      company_id: `eq.${companyId}`,
      date: `gt.${to}`,
    });
    (laterRuns || []).forEach((r) => {
      if (!r.finished_item_id) return;
      netAfterByProduct[r.finished_item_id] = (netAfterByProduct[r.finished_item_id] || 0) + Number(r.qty_produced);
    });
  }

  return (products || []).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    category: p.categories?.name || null,
    stockIn: inByProduct[p.id] || 0,
    stockOut: outByProduct[p.id] || 0,
    closingBalance: Number(p.stock_quantity) - (netAfterByProduct[p.id] || 0)
  }));
}

module.exports = { getProducts, getProductById, createProduct, updateProduct, updateStock, deleteProduct, getStockReport };
