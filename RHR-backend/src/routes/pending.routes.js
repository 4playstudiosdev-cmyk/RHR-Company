const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// Everything waiting on an admin, one row per item — the single source for the
// sidebar badges (GET /pending-counts) and the notification bell's "Needs
// attention" list (GET /pending-counts/items), so every number shown is the
// same count of the same things.
// A branch admin sees their own branch; a super admin sees every branch
// (or the one in ?company_id=). Every lookup is independent — one failing
// lookup reads as nothing and never breaks the rest.

const pkr = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK')}`;
const get = (table, params) => pgrestGet(table, params).then((r) => r || []).catch(() => []);
const ids = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
const byId = async (table, select, list) => {
  if (!list.length) return new Map();
  const rows = await get(table, { select: `id,${select}`, id: `in.(${list.join(',')})` });
  return new Map(rows.map((r) => [r.id, r]));
};

async function loadPendingItems(companyId) {
  const cf = companyId ? { company_id: `eq.${companyId}` } : {};
  const [
    companies, orders, recoveries, closings, cheques, amountChanges,
    customers, salesmen, drivers, payments, leave,
  ] = await Promise.all([
    get('companies', { select: 'id,name,city' }),
    get('orders', { select: 'id,company_id,order_number,customer_id,salesman_id,total_amount,created_at', status: 'eq.pending', invoice_deleted_at: 'is.null', ...cf }),
    // salesmen's AND drivers' pending online payments / vendor transfers — approved from Salesman Recovery → Pending Approvals
    get('salesman_recoveries', { select: 'id,company_id,salesman_id,driver_id,customer_id,amount,payment_type,payment_method,created_at', status: 'eq.pending', payment_type: 'neq.cheque', ...cf }),
    get('salesman_cash_closings', { select: 'id,company_id,salesman_id,driver_id,amount,deposit_to,created_at', status: 'eq.pending', ...cf }),
    // cheques wait at the bank until cleared — they stay here until dealt with
    get('salesman_recoveries', { select: 'id,company_id,salesman_id,customer_id,amount,cheque_number,cheque_bank,cheque_date,created_at', payment_type: 'eq.cheque', cheque_status: 'eq.pending', status: 'neq.deleted', ...cf }),
    get('vendor_amount_change_requests', { select: 'id,company_id,recovery_id,supplier_name,customer_name,old_amount,new_amount,requested_by_name,created_at', status: 'eq.pending', ...cf }),
    get('users', { select: 'id,company_id,full_name,shop_name,created_at', role: 'eq.customer', is_approved: 'eq.false', is_active: 'eq.true', ...cf }),
    get('salesmen', { select: 'id,company_id,full_name,created_at', is_approved: 'eq.false', is_active: 'eq.true', ...cf }),
    get('drivers', { select: 'id,company_id,full_name,created_at', is_approved: 'eq.false', is_active: 'eq.true', ...cf }),
    get('payments', { select: 'id,company_id,customer_id,amount,created_at', status: 'eq.pending', ...cf }),
    get('leave_requests', { select: '*', status: 'eq.pending', ...cf }),
  ]);

  const custIds = ids([...orders, ...recoveries, ...cheques, ...payments], 'customer_id');
  const smIds = ids([...orders, ...recoveries, ...closings, ...cheques], 'salesman_id');
  const drIds = ids([...recoveries, ...closings], 'driver_id');
  const [custMap, smMap, drMap] = await Promise.all([
    byId('users', 'full_name,shop_name', custIds),
    byId('salesmen', 'full_name', smIds),
    byId('drivers', 'full_name', drIds),
  ]);
  const cityOf = new Map(companies.map((c) => [c.id, c.city || c.name]));
  const cust = (id) => { const c = custMap.get(id); return c ? (c.shop_name || c.full_name) : ''; };
  const who = (r) => smMap.get(r.salesman_id)?.full_name || drMap.get(r.driver_id)?.full_name || '';

  const items = [];
  const add = (key, kind, r, title, body, route, amount, refIds) => items.push({
    key, kind, id: r.id, ref_ids: [r.id, ...(refIds || [])], title, body, amount: amount ?? null, route,
    at: r.created_at, company_id: r.company_id || null, city: cityOf.get(r.company_id) || '',
  });

  orders.forEach((o) => {
    const sm = smMap.get(o.salesman_id)?.full_name;
    add('orders', 'order', o, `Pending order ${o.order_number || ''}`.trim(),
      [cust(o.customer_id), sm && `by ${sm}`, pkr(o.total_amount)].filter(Boolean).join(' · '),
      { order: o.id }, o.total_amount);
  });
  recoveries.forEach((r) => {
    const method = r.payment_type === 'vendor_transfer' ? 'Vendor transfer'
      : (r.payment_method === 'bank_transfer' || r.payment_type === 'online') ? 'Bank transfer' : 'Payment';
    const c = cust(r.customer_id);
    add('recovery', 'recovery', r, `${method} awaiting approval`,
      [who(r) && `${who(r)} recorded ${pkr(r.amount)}`, c && `from ${c}`].filter(Boolean).join(' ') || pkr(r.amount),
      { page: 'recovery', tab: 'pending' }, r.amount);
  });
  closings.forEach((c) => add('recovery', 'cash_closing', c, 'Cash closing awaiting approval',
    `${who(c) || 'Salesman'} deposited ${pkr(c.amount)}${c.deposit_to ? ` to ${c.deposit_to}` : ''}`,
    { page: 'recovery', tab: 'pending' }, c.amount));
  amountChanges.forEach((a) => add('recovery', 'amount_change', a, 'Vendor amount change request',
    `${a.requested_by_name || 'Salesman'}: ${a.supplier_name || 'vendor'}${a.customer_name ? ` (${a.customer_name})` : ''} — ${pkr(a.old_amount)} → ${pkr(a.new_amount)}`,
    { page: 'recovery', tab: 'pending' }, a.new_amount, a.recovery_id ? [a.recovery_id] : []));
  cheques.forEach((c) => add('recovery', 'cheque', c, `Cheque pending — ${c.cheque_bank || 'bank'} #${c.cheque_number || ''}`.trim(),
    [cust(c.customer_id), who(c) && `by ${who(c)}`, pkr(c.amount), c.cheque_date && `dated ${String(c.cheque_date).slice(0, 10)}`].filter(Boolean).join(' · '),
    { page: 'recovery', tab: 'cheques' }, c.amount));
  customers.forEach((u) => add('customers', 'customer', u, 'Customer awaiting approval', u.shop_name || u.full_name || '', { page: 'customers' }));
  salesmen.forEach((s) => add('salesmen', 'salesman', s, 'Salesman awaiting approval', s.full_name || '', { page: 'salesmen' }));
  drivers.forEach((d) => add('vehicles', 'driver', d, 'Driver awaiting approval', d.full_name || '', { page: 'vehicles' }));
  payments.forEach((p) => add('payments', 'payment', p, 'Payment awaiting approval',
    [cust(p.customer_id), pkr(p.amount)].filter(Boolean).join(' · '), { page: 'payments' }, p.amount));
  leave.forEach((l) => add('hrm', 'leave', l, 'Leave request', l.reason || l.leave_type || '', { page: 'hrm' }));

  // newest first (just now at the top); older items that are still not done stay listed below
  items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return items;
}

const countsOf = (items) => {
  const out = { customers: 0, salesmen: 0, vehicles: 0, orders: 0, recovery: 0, payments: 0, hrm: 0 };
  items.forEach((it) => { out[it.key] = (out[it.key] || 0) + 1; });
  return out;
};

// GET /api/v1/pending-counts — { [sidebar page key]: how many items are waiting }
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    return success(res, countsOf(await loadPendingItems(resolveCompanyId(req))));
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/pending-counts/items — the same items, one row each (newest first)
router.get('/items', authenticate, isAdmin, async (req, res) => {
  try {
    const items = await loadPendingItems(resolveCompanyId(req));
    return success(res, { items, counts: countsOf(items), total: items.length });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
