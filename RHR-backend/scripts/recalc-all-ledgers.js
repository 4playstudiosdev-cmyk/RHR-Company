/**
 * One-time migration: recalculate stored running_balance for every customer.
 *
 * The /customers endpoint reads the stored running_balance from the most-recent
 * ledger_entries row. Backdated entries inserted before the recalc-on-insert
 * fix (commit 5ad1cbb) left all newer rows with stale values, causing the
 * Flutter outstanding screen to disagree with the admin getLedger view.
 *
 * Run once: node scripts/recalc-all-ledgers.js
 */

require('dotenv').config();
const { pgrestGet, pgrestPatch } = require('../src/utils/directQuery');

async function recalcCustomer(customerId) {
  const entries = await pgrestGet('ledger_entries', {
    select: 'id,entry_type,amount,running_balance',
    customer_id: `eq.${customerId}`,
    order: 'created_at.asc',
  });
  if (!entries?.length) return { customerId, fixed: 0 };

  let bal = 0;
  let fixed = 0;
  for (const e of entries) {
    bal = e.entry_type === 'debit' ? bal + Number(e.amount) : bal - Number(e.amount);
    if (Number(e.running_balance) !== bal) {
      await pgrestPatch('ledger_entries', { id: `eq.${e.id}` }, { running_balance: bal });
      fixed++;
    }
  }
  return { customerId, fixed, finalBalance: bal };
}

async function main() {
  const customers = await pgrestGet('users', { select: 'id,full_name', role: 'eq.customer', is_active: 'eq.true', order: 'full_name.asc' });
  if (!customers?.length) { console.log('No customers found'); return; }

  console.log(`Recalculating ledgers for ${customers.length} customers…\n`);
  let totalFixed = 0;

  for (const c of customers) {
    const { fixed, finalBalance } = await recalcCustomer(c.id);
    if (fixed > 0) {
      console.log(`✓ ${c.full_name}: fixed ${fixed} entries  →  balance = ${finalBalance}`);
      totalFixed += fixed;
    }
  }

  console.log(`\nDone. ${totalFixed} entries updated across ${customers.length} customers.`);
}

main().catch(err => { console.error(err); process.exit(1); });
