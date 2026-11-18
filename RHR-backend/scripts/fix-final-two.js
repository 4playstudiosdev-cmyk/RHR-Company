/**
 * Fix last two failing tables:
 *   1. deleted_invoices  — remove created_at from transform
 *   2. admin_accounts    — migrate 8 rows (table now created in new project)
 */

const { supabaseAdmin: sbOld } = require('../src/config/supabase');
const { createClient } = require('@supabase/supabase-js');

const NEW_URL = 'https://wwjvfdcfcbdmpkwewflm.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3anZmZGNmY2JkbXBrd2V3ZmxtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDk0MDA2NSwiZXhwIjoyMTEwNTE2MDY1fQ.DUD_BGT6y3GkWkMPOS4WmZdfdHblG_43p1BbtDUyd9M';
const sbNew = createClient(NEW_URL, NEW_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(msg) { console.log(new Date().toISOString().substring(11,19) + '  ' + msg); }

async function fetchAll(table, select = '*') {
  const pageSize = 1000;
  let all = [], from = 0;
  while (true) {
    const { data, error } = await sbOld.from(table).select(select).order('created_at', { ascending: true }).range(from, from + pageSize - 1);
    if (error) { log(`⚠️  ${table}: ${error.message}`); break; }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function upsert(table, rows, conflict = 'id') {
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
  // 1. deleted_invoices (no created_at column in new project)
  log('--- deleted_invoices ---');
  // Use id ordering since deleted_invoices has no created_at column
  const { data: dinv = [], error: dinvErr } = await sbOld.from('deleted_invoices')
    .select('id,original_order_id,order_number,customer_name,total_amount,invoice_url,deleted_by,deleted_at,reason,original_data')
    .order('id', { ascending: true });
  if (dinvErr) { log(`  ❌ fetch deleted_invoices: ${dinvErr.message}`); }
  const dinvRows = dinv.map(r => ({ ...r, company_id: null }));
  await upsert('deleted_invoices', dinvRows);

  // 2. admin_accounts
  log('--- admin_accounts ---');
  const aa = await fetchAll('admin_accounts',
    'id,full_name,email,phone,role,company_id,is_active,permissions,created_at,branch_name,branch_city');
  if (aa.length === 0) {
    log('admin_accounts: no rows found in old project');
  } else {
    await upsert('admin_accounts', aa);
  }

  log('=== DONE ===');
}

main().catch(e => { console.error(e); process.exit(1); });
