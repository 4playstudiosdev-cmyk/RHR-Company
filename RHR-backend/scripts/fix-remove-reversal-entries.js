// One-time cleanup: remove stale (original + reversal) ledger entry pairs created
// by old code that added an ADJUSTMENT debit instead of hard-deleting the original.
// Finds every ADJUSTMENT entry whose description contains "balance restored" or
// "removed by", then finds the matching original RECOVERY credit entry (same
// customer + amount, closest in time), deletes both, and recalcs running balances.
// Also cleans up supplier_ledger_entries the same way.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function recalc(table, idField, id) {
  const { data } = await sb.from(table).select('id,entry_type,amount')
    .eq(idField, id).order('created_at', { ascending: true }).order('id', { ascending: true });
  if (!data?.length) return;
  let bal = 0;
  for (const row of data) {
    bal = row.entry_type === 'debit' ? bal + Number(row.amount) : bal - Number(row.amount);
    await sb.from(table).update({ running_balance: bal }).eq('id', row.id);
  }
}

async function cleanTable({ ledgerTable, ownerField }) {
  // Find all stale reversal entries (debit, adjustment, "balance restored")
  const { data: reversals, error: re } = await sb
    .from(ledgerTable)
    .select(`id,${ownerField},amount,description,created_at`)
    .or('description.ilike.%balance restored%,description.ilike.%removed by%')
    .eq('entry_type', 'debit');
  if (re) { console.error(`${ledgerTable} fetch error:`, re.message); return; }
  if (!reversals?.length) { console.log(`${ledgerTable}: no stale reversals found`); return; }

  console.log(`${ledgerTable}: found ${reversals.length} reversal entries to remove`);
  const affected = new Set();

  for (const rev of reversals) {
    const ownerId = rev[ownerField];
    const revDate = new Date(rev.created_at);
    const windowStart = new Date(revDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Find matching original credit entry (same owner, same amount, within 7 days before)
    const { data: originals } = await sb
      .from(ledgerTable)
      .select('id,created_at')
      .eq(ownerField, ownerId)
      .eq('entry_type', 'credit')
      .eq('amount', Number(rev.amount))
      .gte('created_at', windowStart)
      .lte('created_at', rev.created_at)
      .order('created_at', { ascending: false })
      .limit(1);

    const origId = originals?.[0]?.id;
    console.log(`  reversal id=${rev.id}  amount=${rev.amount}  "${rev.description.slice(0, 60)}"`);
    if (origId) {
      console.log(`    matched original id=${origId} — deleting both`);
      await sb.from(ledgerTable).delete().eq('id', origId);
    } else {
      console.log(`    no matching original found — deleting reversal only`);
    }
    await sb.from(ledgerTable).delete().eq('id', rev.id);
    affected.add(ownerId);
  }

  console.log(`  recalculating ${affected.size} ${ownerField}(s)...`);
  for (const id of affected) {
    await recalc(ledgerTable, ownerField, id);
    console.log(`    ${ownerField}=${id} done`);
  }
}

async function main() {
  await cleanTable({ ledgerTable: 'ledger_entries',          ownerField: 'customer_id' });
  await cleanTable({ ledgerTable: 'supplier_ledger_entries', ownerField: 'supplier_id' });
  console.log('\nAll done.');
}

main().catch(err => { console.error(err); process.exit(1); });
