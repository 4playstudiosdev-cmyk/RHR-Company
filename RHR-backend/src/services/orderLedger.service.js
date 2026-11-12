const { pgrestGet, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

// What an order currently owes the customer's ledger: its debit(s) minus any credit already
// posted against it. Cash collected on delivery / payments are separate entries with no order
// reference, so they are not counted here.
async function orderLedgerNet(orderId) {
  const rows = await pgrestGet('ledger_entries', {
    select: 'entry_type,amount',
    reference_type: 'eq.order',
    reference_id: `eq.${orderId}`,
  });
  return (rows || []).reduce(
    (n, r) => n + (r.entry_type === 'debit' ? Number(r.amount) : -Number(r.amount)), 0);
}

// Recalculate and patch running_balance for all of a customer's ledger entries.
// Needed after hard-deleting an entry so stored running_balance values stay accurate
// for future writes (getLedger recalculates on the fly, but creditLedger/adjustLedger
// read the last stored running_balance to compute the next one).
async function recalcCustomerLedger(customerId) {
  const entries = await pgrestGet('ledger_entries', {
    select: 'id,entry_type,amount,running_balance',
    customer_id: `eq.${customerId}`,
    order: 'created_at.asc',
  });
  if (!entries?.length) return;
  let bal = 0;
  for (const e of entries) {
    bal = e.entry_type === 'debit' ? bal + Number(e.amount) : bal - Number(e.amount);
    if (Number(e.running_balance) !== bal) {
      await pgrestPatch('ledger_entries', { id: `eq.${e.id}` }, { running_balance: bal });
    }
  }
}

// Hard-delete all ledger entries for an order and recalculate the customer's running
// balances. No reversal entry is left behind — the order disappears from the ledger
// completely. Returns the net amount that was removed (0 if nothing was there).
async function deleteOrderLedgerEntries(order) {
  const net = await orderLedgerNet(order.id);
  if (net === 0) return 0;
  await pgrestDelete('ledger_entries', {
    reference_type: 'eq.order',
    reference_id: `eq.${order.id}`,
  });
  await recalcCustomerLedger(order.customer_id);
  return net;
}

module.exports = { orderLedgerNet, deleteOrderLedgerEntries, recalcCustomerLedger };
