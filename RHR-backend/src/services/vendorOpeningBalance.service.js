const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { recalcSupplierLedger } = require('./orderLedger.service');

// A vendor carries a single opening balance — either 'debit' (we owe them)
// or 'credit' (they owe us / advance already paid) — dated on balance_date.
// It is stored twice: the `opening_balances` reference row and one
// `supplier_ledger_entries` row (reference_type 'opening_balance') that the
// ledger always shows as the first line. This keeps both in step.

const today = () => new Date().toISOString().split('T')[0];
const ledgerTimestamp = (date) => `${date}T00:00:00.000Z`;
const describe = (type) => (type === 'credit' ? 'Opening balance — amount vendor owed' : 'Opening balance');

async function upsertVendorOpeningBalance({ supplierId, entityName, balanceType, amount, balanceDate, notes, user }) {
  const type = balanceType === 'credit' ? 'credit' : 'debit';
  const amt = Number(amount) || 0;
  const date = balanceDate || null;

  const supplierRows = await pgrestGet('suppliers', { select: 'id,name,company_id', id: `eq.${supplierId}` });
  const supplier = supplierRows?.[0];
  if (!supplier) throw new Error('Supplier not found');
  if (user.role !== 'super_admin' && supplier.company_id !== user.company_id) throw new Error('Access denied');

  // ── Reference row(s) in opening_balances ─────────────────────────────────
  const refs = await pgrestGet('opening_balances', {
    select: 'id,balance_date',
    entity_type: 'eq.vendor',
    entity_id: `eq.${supplierId}`,
    order: 'created_at.desc',
  });
  const [keepRef, ...extraRefs] = refs || [];
  const effectiveDate = date || keepRef?.balance_date || today();
  for (const r of extraRefs) await pgrestDelete('opening_balances', { id: `eq.${r.id}` });

  let refRow = null;
  if (amt <= 0) {
    if (keepRef) await pgrestDelete('opening_balances', { id: `eq.${keepRef.id}` });
  } else if (keepRef) {
    [refRow] = await pgrestPatch('opening_balances', { id: `eq.${keepRef.id}` }, {
      balance_type: type,
      amount: amt,
      balance_date: effectiveDate,
      entity_name: entityName || supplier.name,
    }) || [];
  } else {
    [refRow] = await pgrestPost('opening_balances', {
      company_id: supplier.company_id,
      entity_type: 'vendor',
      entity_id: supplierId,
      entity_name: entityName || supplier.name,
      balance_type: type,
      amount: amt,
      notes: notes || null,
      balance_date: effectiveDate,
      created_by: user.id,
    }) || [];
  }

  // ── The single opening line in supplier_ledger_entries ───────────────────
  const lines = await pgrestGet('supplier_ledger_entries', {
    select: 'id',
    supplier_id: `eq.${supplierId}`,
    reference_type: 'eq.opening_balance',
    order: 'created_at.asc',
  });
  const [keepLine, ...extraLines] = lines || [];
  for (const l of extraLines) await pgrestDelete('supplier_ledger_entries', { id: `eq.${l.id}` });

  if (amt <= 0) {
    // amount has a CHECK (> 0), so a cleared balance means no line at all
    if (keepLine) await pgrestDelete('supplier_ledger_entries', { id: `eq.${keepLine.id}` });
  } else if (keepLine) {
    await pgrestPatch('supplier_ledger_entries', { id: `eq.${keepLine.id}` }, {
      entry_type: type,
      amount: amt,
      description: describe(type),
      created_at: ledgerTimestamp(effectiveDate),
    });
  } else {
    await pgrestPost('supplier_ledger_entries', {
      company_id: supplier.company_id,
      supplier_id: supplierId,
      entry_type: type,
      amount: amt,
      running_balance: 0,
      description: describe(type),
      reference_type: 'opening_balance',
      created_at: ledgerTimestamp(effectiveDate),
      created_by: user.id,
    });
  }

  await recalcSupplierLedger(supplierId);
  return refRow;
}

// Older vendors can have an opening_balances row with no matching ledger
// line (the ledger write used to fail silently / was never made on edit).
// Called when the ledger is opened so those balances show up again.
// Returns true when a line was created.
async function ensureVendorOpeningLine(supplierId, ledgerEntries, userId) {
  if ((ledgerEntries || []).some(e => e.reference_type === 'opening_balance')) return false;
  const refs = await pgrestGet('opening_balances', {
    select: 'balance_type,amount,balance_date,company_id',
    entity_type: 'eq.vendor',
    entity_id: `eq.${supplierId}`,
    amount: 'gt.0',
    order: 'created_at.desc',
    limit: '1',
  });
  const ref = refs?.[0];
  if (!ref) return false;
  const supplierRows = await pgrestGet('suppliers', { select: 'company_id', id: `eq.${supplierId}` });
  const type = ref.balance_type === 'credit' ? 'credit' : 'debit';
  await pgrestPost('supplier_ledger_entries', {
    company_id: supplierRows?.[0]?.company_id || ref.company_id,
    supplier_id: supplierId,
    entry_type: type,
    amount: Number(ref.amount),
    running_balance: 0,
    description: describe(type),
    reference_type: 'opening_balance',
    created_at: ledgerTimestamp(ref.balance_date || today()),
    created_by: userId || null,
  });
  await recalcSupplierLedger(supplierId);
  return true;
}

module.exports = { upsertVendorOpeningBalance, ensureVendorOpeningLine };
