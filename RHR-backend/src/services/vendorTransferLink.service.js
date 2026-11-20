const { pgrestGetRaw } = require('../utils/directQuery');

// supplier_ledger_entries rows carry no reference to the salesman recovery that produced
// them, so the link is rebuilt the same way the delete flow does it: vendor + amount, then
// the entry's date, falling back to the only candidate when the date was edited.
async function findLinkedRecovery(supplierId, amount, entryDate) {
  try {
    const rows = await pgrestGetRaw(
      `salesman_recoveries?select=id,company_id,salesman_id,customer_id,amount,recovery_date,users!customer_id(full_name,shop_name)` +
      `&vendor_id=eq.${supplierId}&payment_type=eq.vendor_transfer&status=eq.approved&amount=eq.${Number(amount)}&order=created_at.asc`
    );
    if (!rows?.length) return null;
    const day = String(entryDate || '').slice(0, 10);
    return rows.find((r) => String(r.recovery_date || '').slice(0, 10) === day) || (rows.length === 1 ? rows[0] : null);
  } catch (_) { return null; }
}

module.exports = { findLinkedRecovery };
