const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { pgrestGet: rawGet } = require('../utils/directQuery');
const { withRetry }    = require('../utils/withRetry');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');

// Data for the main admin Dashboard widgets: today's numbers, most selling
// products, top clients, orders vs stock, the week calendar and recovery
// reminders. Every endpoint is scoped like the rest of the admin API
// (super_admin: ?company_id=<uuid> for one branch or nothing for all
// branches; branch_admin: always their own) and read through the pgrest
// raw-https helper (see utils/directQuery.js).
//
// Dates: the browser sends its own local "today" (?today=YYYY-MM-DD) so
// "today" means the admin's day, not the server's (UTC) day.

// A transient Railway<->Supabase blip (see utils/withRetry.js) shouldn't blank a
// whole widget — retry each read once or twice.
const pgrestGet = (table, params) => withRetry(() => rawGet(table, params), 3, 400);

const NOT_SALES = 'not.in.(cancelled,undelivered)';

const isoDate = (d) => d.toISOString().split('T')[0];

function resolveToday(req) {
  const t = String(req.query.today || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : isoDate(new Date());
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

function periodRange(period, today) {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (period) {
    case 'today':      return { from: today, to: today };
    case 'week':       return { from: addDays(today, -6), to: today };
    case 'last_month': {
      const lastEnd = addDays(monthStart, -1);
      return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd };
    }
    case 'all':        return { from: '2000-01-01', to: today };
    case 'month':
    default:           return { from: monthStart, to: today };
  }
}

const companyFilter = (req) => {
  const id = resolveCompanyId(req);
  return id ? { company_id: `eq.${id}` } : {};
};

const between = (field, from, to) => ({ and: `(${field}.gte.${from}T00:00:00,${field}.lte.${to}T23:59:59)` });

// PostgREST returns at most 1000 rows per request — page through for
// tables that can outgrow that (ledger entries, orders).
async function fetchAll(table, params) {
  const PAGE = 1000;
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await pgrestGet(table, { ...params, limit: String(PAGE), offset: String(offset) });
    rows.push(...(page || []));
    if (!page || page.length < PAGE) break;
  }
  return rows;
}

// Latest running balance per customer = what they currently owe (positive)
// or have in credit (negative).
async function outstandingByCustomer(cf) {
  const rows = await fetchAll('ledger_entries', {
    select: 'customer_id,running_balance,created_at', order: 'created_at.desc', ...cf,
  });
  const map = {};
  rows.forEach((r) => {
    if (!(r.customer_id in map)) map[r.customer_id] = Number(r.running_balance) || 0;
  });
  return map;
}

const displayName = (u) => u?.shop_name || u?.full_name || 'Customer';

// Approved money received from customers in a date range, from both
// recovery sources (salesman recoveries and direct payments).
async function approvedReceipts(cf, from, to) {
  const [recoveries, payments] = await Promise.all([
    pgrestGet('salesman_recoveries', {
      select: 'id,customer_id,amount,payment_type,recovery_date,created_at,users!customer_id(full_name,shop_name)',
      status: 'eq.approved',
      and: `(recovery_date.gte.${from},recovery_date.lte.${to})`,
      order: 'recovery_date.desc,created_at.desc',
      ...cf,
    }),
    pgrestGet('payments', {
      select: 'id,customer_id,amount,method,created_at,users!customer_id(full_name,shop_name)',
      status: 'eq.approved',
      ...between('created_at', from, to),
      order: 'created_at.desc',
      ...cf,
    }),
  ]);
  return [
    ...(recoveries || []).map((r) => ({
      id: `rec-${r.id}`, customer_id: r.customer_id, name: displayName(r.users),
      amount: Number(r.amount) || 0, method: r.payment_type || 'cash',
      date: r.recovery_date, at: r.created_at,
    })),
    ...(payments || []).map((p) => ({
      id: `pay-${p.id}`, customer_id: p.customer_id, name: displayName(p.users),
      amount: Number(p.amount) || 0, method: p.method || 'cash',
      date: String(p.created_at).slice(0, 10), at: p.created_at,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
}

// GET /dashboard/summary — the "today" cards plus month-over-month trend.
router.get('/summary', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const today = resolveToday(req);
    const monthStart = `${today.slice(0, 7)}-01`;
    const lastMonth = periodRange('last_month', today);

    const [todayOrders, thisMonthOrders, lastMonthOrders, outstandingMap, receiptsToday, allReceipts] = await Promise.all([
      pgrestGet('orders', { select: 'id,total_amount', status: NOT_SALES, invoice_deleted_at: 'is.null', ...between('created_at', today, today), ...cf }),
      pgrestGet('orders', { select: 'id,total_amount', status: NOT_SALES, invoice_deleted_at: 'is.null', ...between('created_at', monthStart, today), ...cf }),
      pgrestGet('orders', { select: 'id,total_amount', status: NOT_SALES, invoice_deleted_at: 'is.null', ...between('created_at', lastMonth.from, lastMonth.to), ...cf }),
      outstandingByCustomer(cf),
      approvedReceipts(cf, today, today),
      approvedReceipts(cf, '2000-01-01', today),
    ]);
    const recentReceipts = allReceipts;
    const [cashClosings, expensesToday, newClients, pendingOrders, products, rawMaterials] = await Promise.all([
      pgrestGet('salesman_cash_closings', { select: 'amount', status: 'eq.approved', ...cf }),
      pgrestGet('expenses', { select: 'amount', expense_date: `eq.${today}`, ...cf }),
      pgrestGet('users', { select: 'id', role: 'eq.customer', ...between('created_at', monthStart, today), ...cf }),
      pgrestGet('orders', { select: 'id', status: 'in.(pending,confirmed)', invoice_deleted_at: 'is.null', ...cf }),
      pgrestGet('products', { select: 'id,stock_quantity', is_active: 'eq.true', ...cf }),
      pgrestGet('raw_materials', { select: 'stock,min_level', ...cf }),
    ]);

    const sum = (rows, key = 'total_amount') => (rows || []).reduce((s, r) => s + (Number(r[key]) || 0), 0);

    // Cash = cash receipts minus what salesmen deposited; Bank = every
    // non-cash receipt (bank transfer, cheque, online).
    const cashIn = allReceipts.filter((r) => String(r.method).toLowerCase() === 'cash').reduce((s, r) => s + r.amount, 0);
    const bankIn = allReceipts.filter((r) => String(r.method).toLowerCase() !== 'cash').reduce((s, r) => s + r.amount, 0);
    const cash = cashIn - sum(cashClosings, 'amount');

    const outstanding = Object.values(outstandingMap).reduce((s, b) => s + (b > 0 ? b : 0), 0);
    const salesThisMonth = sum(thisMonthOrders);
    const salesLastMonth = sum(lastMonthOrders);

    const lowStock =
      (products || []).filter((p) => Number(p.stock_quantity) <= 5).length +
      (rawMaterials || []).filter((m) => Number(m.min_level) > 0 && Number(m.stock) <= Number(m.min_level)).length;

    return success(res, {
      today,
      sales_today: sum(todayOrders),
      orders_today: (todayOrders || []).length,
      recovery_today: receiptsToday.reduce((s, r) => s + r.amount, 0),
      expense_today: sum(expensesToday, 'amount'),
      outstanding,
      pending_orders: (pendingOrders || []).length,
      cash, bank: bankIn, bank_cash: cash + bankIn,
      low_stock_alerts: lowStock,
      sales_this_month: salesThisMonth,
      sales_last_month: salesLastMonth,
      sales_change_pct: salesLastMonth > 0 ? Math.round(((salesThisMonth - salesLastMonth) / salesLastMonth) * 100) : null,
      new_clients: (newClients || []).length,
      recent_recoveries: recentReceipts.slice(0, 6),
    });
  } catch (err) { return error(res, err.message); }
});

// GET /dashboard/top-products?period=today|week|month|last_month|all
router.get('/top-products', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const { from, to } = periodRange(req.query.period, resolveToday(req));

    const [orders, products] = await Promise.all([
      fetchAll('orders', {
        select: 'id,order_items(product_id,product_name,quantity,subtotal)',
        status: NOT_SALES, invoice_deleted_at: 'is.null', ...between('created_at', from, to), ...cf,
      }),
      pgrestGet('products', { select: 'id,name,image_url,unit', ...cf }),
    ]);

    const byName = new Map((products || []).map((p) => [p.name.trim().toLowerCase(), p]));
    const byId = new Map((products || []).map((p) => [p.id, p]));
    const agg = {};
    orders.forEach((o) => {
      (o.order_items || []).forEach((it) => {
        // Same product exists once per branch — group by name so "All
        // cities" shows one row per product, not one per branch copy.
        const key = String(it.product_name || '').trim().toLowerCase();
        const a = (agg[key] = agg[key] || { name: it.product_name, qty: 0, revenue: 0, orderIds: new Set(), product_id: it.product_id });
        a.qty += Number(it.quantity) || 0;
        a.revenue += Number(it.subtotal) || 0;
        a.orderIds.add(o.id);
      });
    });

    const rows = Object.entries(agg).map(([key, a]) => {
      const p = byName.get(key) || byId.get(a.product_id);
      return { name: a.name, qty: a.qty, revenue: a.revenue, orders: a.orderIds.size, unit: p?.unit || 'bag', image_url: p?.image_url || null };
    }).sort((a, b) => b.qty - a.qty).slice(0, 8);

    return success(res, { range: { from, to }, products: rows });
  } catch (err) { return error(res, err.message); }
});

// GET /dashboard/top-clients?period=&sort=sales|recovery|outstanding
router.get('/top-clients', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const today = resolveToday(req);
    const { from, to } = periodRange(req.query.period, today);
    const sort = ['sales', 'recovery', 'outstanding'].includes(req.query.sort) ? req.query.sort : 'sales';

    const [orders, receipts, outstandingMap, customers] = await Promise.all([
      fetchAll('orders', { select: 'customer_id,total_amount', status: NOT_SALES, invoice_deleted_at: 'is.null', ...between('created_at', from, to), ...cf }),
      approvedReceipts(cf, from, to),
      outstandingByCustomer(cf),
      pgrestGet('users', { select: 'id,full_name,shop_name,city,area', role: 'eq.customer', is_active: 'eq.true', ...cf }),
    ]);

    const stats = {};
    const get = (id) => (stats[id] = stats[id] || { orders: 0, sales: 0, recovery: 0 });
    orders.forEach((o) => { const s = get(o.customer_id); s.orders += 1; s.sales += Number(o.total_amount) || 0; });
    receipts.forEach((r) => { get(r.customer_id).recovery += r.amount; });

    const rows = (customers || []).map((c) => {
      const s = stats[c.id] || { orders: 0, sales: 0, recovery: 0 };
      return {
        id: c.id, name: displayName(c), contact: c.shop_name ? c.full_name : null,
        place: [c.area, c.city].filter(Boolean).join(', ') || null,
        orders: s.orders, sales: s.sales, recovery: s.recovery,
        outstanding: Math.max(0, outstandingMap[c.id] || 0),
      };
    }).filter((r) => r.sales > 0 || r.recovery > 0 || r.outstanding > 0)
      .sort((a, b) => (b[sort] - a[sort]) || (b.sales - a.sales))
      .slice(0, 10);

    return success(res, { range: { from, to }, sort, clients: rows });
  } catch (err) { return error(res, err.message); }
});

// GET /dashboard/orders-vs-stock — quantity still to supply on open orders
// (pending / confirmed / preparing) against what's in stock, per product.
router.get('/orders-vs-stock', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const [orders, products] = await Promise.all([
      fetchAll('orders', {
        select: 'id,order_items(product_name,quantity)', status: 'in.(pending,confirmed,preparing)', invoice_deleted_at: 'is.null', ...cf,
      }),
      pgrestGet('products', { select: 'id,name,image_url,unit,stock_quantity', is_active: 'eq.true', ...cf }),
    ]);

    const demand = {};
    orders.forEach((o) => (o.order_items || []).forEach((it) => {
      const key = String(it.product_name || '').trim().toLowerCase();
      const d = (demand[key] = demand[key] || { qty: 0, parts: [] });
      const q = Number(it.quantity) || 0;
      d.qty += q;
      d.parts.push(q);
    }));

    // One row per product name (each branch holds its own copy): stock adds up.
    const merged = {};
    (products || []).forEach((p) => {
      const key = p.name.trim().toLowerCase();
      const m = (merged[key] = merged[key] || { name: p.name, unit: p.unit, image_url: p.image_url, stock: 0 });
      m.stock += Number(p.stock_quantity) || 0;
      if (!m.image_url && p.image_url) m.image_url = p.image_url;
    });

    const rows = Object.entries(merged).map(([key, m]) => {
      const d = demand[key];
      const ordered = d?.qty || 0;
      const diff = m.stock - ordered;
      return {
        name: m.name, unit: m.unit, image_url: m.image_url, ordered, stock: m.stock,
        parts: d ? d.parts.slice(0, 4) : [],
        status: ordered === 0 ? 'none' : (diff < 0 ? 'short' : 'ok'),
        short_by: diff < 0 ? -diff : 0,
        left: diff > 0 ? diff : 0,
      };
    }).sort((a, b) => {
      const rank = { short: 0, ok: 1, none: 2 };
      return (rank[a.status] - rank[b.status]) || (b.ordered - a.ordered);
    });

    return success(res, {
      total_ordered: rows.reduce((s, r) => s + r.ordered, 0),
      short_count: rows.filter((r) => r.status === 'short').length,
      products: rows,
    });
  } catch (err) { return error(res, err.message); }
});

// GET /dashboard/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — what happened
// each day: deliveries and recoveries.
router.get('/calendar', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const today = resolveToday(req);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? req.query.from : addDays(today, -3);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? req.query.to : addDays(today, 3);

    const [delivered, receipts] = await Promise.all([
      pgrestGet('orders', {
        select: 'id,order_number,total_amount,updated_at,users!customer_id(full_name,shop_name)',
        status: 'eq.delivered', invoice_deleted_at: 'is.null', ...between('updated_at', from, to), order: 'updated_at.desc', ...cf,
      }),
      approvedReceipts(cf, from, to),
    ]);

    const events = [
      ...(delivered || []).map((o) => ({
        id: `ord-${o.id}`, type: 'delivered', date: String(o.updated_at).slice(0, 10), at: o.updated_at,
        title: `Delivered ${o.order_number}`, subtitle: displayName(o.users), amount: Number(o.total_amount) || 0,
      })),
      ...receipts.map((r) => ({
        id: r.id, type: 'recovery', date: r.date, at: r.at,
        title: `Recovery — ${r.name}`, subtitle: `Rs. ${r.amount.toLocaleString()} · ${r.method}`, amount: r.amount,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return success(res, { from, to, events });
  } catch (err) { return error(res, err.message); }
});

// GET /dashboard/reminders — dealers who still owe money, biggest first.
router.get('/reminders', authenticate, isAdmin, async (req, res) => {
  try {
    const cf = companyFilter(req);
    const [outstandingMap, customers] = await Promise.all([
      outstandingByCustomer(cf),
      pgrestGet('users', { select: 'id,full_name,shop_name,phone,city,area', role: 'eq.customer', is_active: 'eq.true', ...cf }),
    ]);
    const reminders = (customers || [])
      .map((c) => ({ id: c.id, name: displayName(c), phone: c.phone, amount: outstandingMap[c.id] || 0 }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    return success(res, { reminders });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
