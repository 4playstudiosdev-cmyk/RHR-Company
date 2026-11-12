/**
 * One-time migration: recalculate running_balance for every supplier's ledger.
 * Run with: node scripts/recalc-all-supplier-ledgers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pgrestGet } = require('../src/utils/directQuery');
const { recalcSupplierLedger } = require('../src/services/orderLedger.service');

async function main() {
  const suppliers = await pgrestGet('suppliers', {
    select: 'id,name',
    is_active: 'eq.true',
    order: 'name.asc',
  });
  if (!suppliers?.length) { console.log('No suppliers found.'); return; }

  console.log(`Recalculating ledgers for ${suppliers.length} suppliers...`);
  let fixed = 0;
  for (const s of suppliers) {
    try {
      await recalcSupplierLedger(s.id);
      process.stdout.write('.');
      fixed++;
    } catch (err) {
      console.error(`\nFailed for ${s.name} (${s.id}): ${err.message}`);
    }
  }
  console.log(`\nDone. Processed ${fixed}/${suppliers.length} suppliers.`);
}

main().catch(console.error);
