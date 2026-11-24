// One vendor payment lives in up to four places:
//   expenses (category 'Vendor Payment')            → Expenses, Cash in Hand / Bank, Daily Report
//   supplier_ledger_entries (credit)                → Vendor Ledger
//   salesman_recoveries (payment_type vendor_transfer) + ledger_entries (credit)
//                                                   → Salesman Recovery history, Customer Ledger
// Deleting it from any one place must remove it from all of them. These helpers
// find the linked rows strictly: same supplier, same amount, same day — never
// "any vendor payment of that amount", so another supplier's line is never hit.
const { pgrestGet, pgrestGetRaw, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { recalcCustomerLedger, recalcSupplierLedger } = require('./orderLedger.service');

const day = (v) => String(v || '').split('T')[0];
const dayRange = (d) => `created_at=gte.${d}T00:00:00.000Z&created_at=lte.${d}T23:59:59.999Z`;

// The Vendor Payment expense of a vendor transfer / vendor payment.
async function findVendorExpense({ companyId, supplierId, amount, date, salesmanId }) {
  const base = { select: 'id,salesman_id,supplier_id', category: 'eq.Vendor Payment', amount: `eq.${Number(amount)}`, expense_date: `eq.${day(date)}`, order: 'created_at.desc' };
  let rows = [];
  if (supplierId) rows = await pgrestGet('expenses', { ...base, supplier_id: `eq.${supplierId}` }).catch(() => []);
  // Older rows were saved without supplier_id — only then fall back to the branch.
  if (!rows?.length && companyId) rows = await pgrestGet('expenses', { ...base, company_id: `eq.${companyId}`, supplier_id: 'is.null' }).catch(() => []);
  if (!rows?.length) return null;
  return (salesmanId && rows.find((r) => r.salesman_id === salesmanId)) || rows[0];
}

// The vendor ledger credit line for a payment. preferType: 'vendor_transfer' | 'payment'.
async function findSupplierCredit({ supplierId, amount, date, preferType }) {
  if (!supplierId) return null;
  const rows = await pgrestGetRaw(
    `supplier_ledger_entries?select=id,supplier_id,reference_type&supplier_id=eq.${supplierId}&entry_type=eq.credit&amount=eq.${Number(amount)}&reference_type=in.(vendor_transfer,payment)&${dayRange(day(date))}&order=created_at.desc`
  ).catch(() => []);
  if (!rows?.length) return null;
  return (preferType && rows.find((r) => r.reference_type === preferType)) || rows[0];
}

// The approved vendor-transfer recovery behind an expense / vendor ledger line.
async function findVendorTransfer({ supplierId, amount, date, salesmanId }) {
  if (!supplierId) return null;
  const rows = await pgrestGet('salesman_recoveries', {
    select: 'id,company_id,salesman_id,customer_id,vendor_id,amount,recovery_date,notes',
    payment_type: 'eq.vendor_transfer', status: 'eq.approved',
    vendor_id: `eq.${supplierId}`, amount: `eq.${Number(amount)}`, recovery_date: `eq.${day(date)}`,
  }).catch(() => []);
  if (!rows?.length) return null;
  return (salesmanId && rows.find((r) => r.salesman_id === salesmanId)) || rows[0];
}

// Remove the customer ledger credit of a recovery and rebalance that customer.
async function removeCustomerCredit(rec) {
  if (!rec?.customer_id) return;
  let ids = (await pgrestGet('ledger_entries', { select: 'id', customer_id: `eq.${rec.customer_id}`, reference_id: `eq.${rec.id}` }).catch(() => [])).map((r) => r.id);
  if (!ids.length && rec.recovery_date) {
    const byDate = await pgrestGetRaw(
      `ledger_entries?select=id&customer_id=eq.${rec.customer_id}&reference_type=eq.recovery&entry_type=eq.credit&amount=eq.${Number(rec.amount)}&${dayRange(day(rec.recovery_date))}&order=created_at.desc&limit=1`
    ).catch(() => []);
    ids = (byDate || []).map((r) => r.id);
  }
  for (const id of ids) await pgrestDelete('ledger_entries', { id: `eq.${id}` });
  try { await recalcCustomerLedger(rec.customer_id); } catch (_) {}
}

// Mark a recovery deleted (kept for the record in Salesman Recovery → Removed).
async function markRecoveryDeleted(rec, reason, userId) {
  const base = { status: 'deleted' };
  await pgrestPatch('salesman_recoveries', { id: `eq.${rec.id}` }, {
    ...base, removed_reason: reason, removed_by: userId || null, removed_at: new Date().toISOString(),
  }).catch(() => pgrestPatch('salesman_recoveries', { id: `eq.${rec.id}` }, {
    ...base, notes: [rec.notes, `Removed: ${reason}`].filter(Boolean).join(' · '),
  }));
}

// An expense was deleted from Expenses: take the same payment out of the vendor
// ledger and, for a vendor transfer, out of Salesman Recovery + the customer ledger.
async function cascadeDeletedVendorExpense(expense, { userId, adminName } = {}) {
  const out = { supplierLine: false, recovery: null };
  if (!expense || expense.category !== 'Vendor Payment' || !expense.supplier_id) return out;
  const date = day(expense.expense_date);
  const rec = await findVendorTransfer({ supplierId: expense.supplier_id, amount: expense.amount, date, salesmanId: expense.salesman_id });

  const line = await findSupplierCredit({ supplierId: expense.supplier_id, amount: expense.amount, date, preferType: rec ? 'vendor_transfer' : 'payment' });
  if (line) {
    await pgrestDelete('supplier_ledger_entries', { id: `eq.${line.id}` });
    try { await recalcSupplierLedger(expense.supplier_id); } catch (_) {}
    out.supplierLine = true;
  }
  if (rec) {
    await removeCustomerCredit(rec);
    await markRecoveryDeleted(rec, `Expense deleted by ${adminName || 'admin'}`, userId);
    out.recovery = rec;
  }
  return out;
}

module.exports = { findVendorExpense, findSupplierCredit, findVendorTransfer, removeCustomerCredit, markRecoveryDeleted, cascadeDeletedVendorExpense };
