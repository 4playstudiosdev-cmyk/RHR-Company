const { pgrestGet, pgrestPost } = require('../utils/directQuery');

// What an order currently owes the customer's ledger: its debit(s) minus any credit already
// posted against it (a cancellation reversal). Cash collected on delivery / payments are
// separate entries with no order reference, so they are not counted here.
async function orderLedgerNet(orderId) {
  const rows = await pgrestGet('ledger_entries', {
    select: 'entry_type,amount',
    reference_type: 'eq.order',
    reference_id: `eq.${orderId}`,
  });
  return (rows || []).reduce(
    (n, r) => n + (r.entry_type === 'debit' ? Number(r.amount) : -Number(r.amount)), 0);
}

// A deleted order must stop counting as money owed: post a credit for whatever is still
// debited against it, so the customer's balance goes back to what it was before the order.
// Idempotent — an order already reversed (cancelled earlier, or this ran before) has a net of
// 0 and nothing is posted. Returns the amount reversed (0 if none).
async function reverseOrderDebit(order, { reason, adminName, userId } = {}) {
  const net = await orderLedgerNet(order.id);
  if (net <= 0) return 0;

  const last = await pgrestGet('ledger_entries', {
    select: 'running_balance',
    customer_id: `eq.${order.customer_id}`,
    order: 'created_at.desc',
    limit: '1',
  });
  const prev = Number(last?.[0]?.running_balance) || 0;
  await pgrestPost('ledger_entries', {
    company_id: order.company_id,
    customer_id: order.customer_id,
    entry_type: 'credit',
    amount: net,
    running_balance: prev - net,
    description: `Order ${order.order_number} deleted${adminName ? ` by ${adminName}` : ''}${reason ? ` — reason: ${reason}` : ''} — debit reversed`,
    reference_type: 'order',
    reference_id: order.id,
    created_by: userId || null,
  });
  return net;
}

module.exports = { orderLedgerNet, reverseOrderDebit };
