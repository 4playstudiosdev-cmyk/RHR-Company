// One-off fix for orders that were deleted BEFORE deleting started reversing the ledger:
// posts the missing credit so the customer no longer owes for them.
//   node scripts/reverse-deleted-orders.js          -> only lists what would be reversed
//   node scripts/reverse-deleted-orders.js --apply  -> posts the reversals
require('dotenv').config();
const { pgrestGet } = require('../src/utils/directQuery');
const { orderLedgerNet, reverseOrderDebit } = require('../src/services/orderLedger.service');

(async () => {
  const apply = process.argv.includes('--apply');
  const orders = await pgrestGet('orders', {
    select: 'id,order_number,customer_id,company_id,total_amount,status,users!customer_id(full_name,shop_name)',
    invoice_deleted_at: 'not.is.null',
  });
  let n = 0;
  for (const o of orders || []) {
    const net = await orderLedgerNet(o.id);
    if (net <= 0) continue;
    n++;
    const who = o.users?.shop_name || o.users?.full_name;
    console.log(`${o.order_number}  ${who}  status=${o.status}  still debited PKR ${net}`);
    if (apply) {
      await reverseOrderDebit(o, { adminName: 'admin', reason: 'order was deleted earlier' });
      console.log('   -> reversed');
    }
  }
  console.log(n ? (apply ? `${n} reversed.` : `${n} would be reversed (run with --apply).`) : 'Nothing to reverse.');
})().catch((e) => { console.error(e.message); process.exit(1); });
