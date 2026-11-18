/**
 * Migrate all remaining missing/empty tables from old → new project
 * Run AFTER creating production_lines table in SQL Editor
 */

const { supabaseAdmin: sbOld } = require('../src/config/supabase');
const { createClient } = require('@supabase/supabase-js');

const NEW_URL = 'https://wwjvfdcfcbdmpkwewflm.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3anZmZGNmY2JkbXBrd2V3ZmxtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDk0MDA2NSwiZXhwIjoyMTEwNTE2MDY1fQ.DUD_BGT6y3GkWkMPOS4WmZdfdHblG_43p1BbtDUyd9M';
const sbNew = createClient(NEW_URL, NEW_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(new Date().toISOString().substring(11,19) + '  ' + msg); }

async function fetchAll(table, select = '*', orderCol = 'created_at') {
  const pageSize = 1000;
  let all = [], from = 0;
  while (true) {
    const { data, error } = await sbOld.from(table).select(select)
      .order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    if (error) { log(`⚠️  fetch ${table}: ${error.message}`); break; }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function upsert(table, rows, conflict = 'id') {
  if (!rows.length) { log(`${table}: no rows`); return; }
  const batchSize = 200;
  let inserted = 0, errors = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sbNew.from(table).upsert(batch, { onConflict: conflict });
    if (error) { log(`  ❌ ${table}: ${error.message}`); errors += batch.length; }
    else inserted += batch.length;
    await sleep(80);
  }
  log(`${table}: inserted=${inserted} errors=${errors}`);
}

async function main() {
  // ── 1. Tables that exist but are empty ───────────────────────────────────
  log('--- salary_structures ---');
  await upsert('salary_structures', await fetchAll('salary_structures'));

  log('--- vehicle_meter_readings ---');
  await upsert('vehicle_meter_readings', await fetchAll('vehicle_meter_readings'));

  log('--- production_recipes ---');
  await upsert('production_recipes', await fetchAll('production_recipes'));

  log('--- recipe_ingredients ---');
  await upsert('recipe_ingredients', await fetchAll('recipe_ingredients'));

  log('--- raw_material_stock_logs ---');
  await upsert('raw_material_stock_logs', await fetchAll('raw_material_stock_logs'));

  log('--- stock_transfers ---');
  await upsert('stock_transfers', await fetchAll('stock_transfers'));

  log('--- unit_conversions ---');
  await upsert('unit_conversions', await fetchAll('unit_conversions'));

  log('--- production_bom ---');
  await upsert('production_bom', await fetchAll('production_bom'));

  log('--- production_bom_items ---');
  await upsert('production_bom_items', await fetchAll('production_bom_items'));

  // ── 2. production_lines (needs table created first in SQL Editor) ─────────
  log('--- production_lines ---');
  await upsert('production_lines', await fetchAll('production_lines'));

  // ── 3. Missing orders (old=368, new=345) ─────────────────────────────────
  log('--- finding missing orders ---');
  const oldOrders = await fetchAll('orders');
  const { data: newOrders } = await sbNew.from('orders').select('id');
  const newIds = new Set((newOrders || []).map(r => r.id));
  const missingOrders = oldOrders.filter(r => !newIds.has(r.id));
  log(`Missing orders: ${missingOrders.length}`);
  if (missingOrders.length) {
    // Disable trigger before inserting (to avoid order_number being overwritten)
    log('  NOTE: If order numbers get wrong, re-run fix-order-numbers script');
    await upsert('orders', missingOrders);
  }

  // ── 4. Missing salesman_recoveries (old=733, new=729) ───────────────────
  log('--- finding missing salesman_recoveries ---');
  const oldRec = await fetchAll('salesman_recoveries');
  const { data: newRec } = await sbNew.from('salesman_recoveries').select('id');
  const newRecIds = new Set((newRec || []).map(r => r.id));
  const missingRec = oldRec.filter(r => !newRecIds.has(r.id));
  log(`Missing salesman_recoveries: ${missingRec.length}`);
  if (missingRec.length) {
    await upsert('salesman_recoveries', missingRec);
  }

  log('=== DONE ===');
}

main().catch(e => { console.error(e); process.exit(1); });
