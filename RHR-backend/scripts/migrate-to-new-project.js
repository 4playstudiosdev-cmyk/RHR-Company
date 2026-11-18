/**
 * RHR Full Project Migration
 * Old → New Supabase Project
 *
 * Usage:
 *   node scripts/migrate-to-new-project.js                 (all phases)
 *   node scripts/migrate-to-new-project.js --phase=data    (only data)
 *   node scripts/migrate-to-new-project.js --phase=storage (only storage)
 *   node scripts/migrate-to-new-project.js --phase=auth    (only auth users)
 *   node scripts/migrate-to-new-project.js --phase=schema  (only print schema SQL path)
 */

const { supabaseAdmin: sbOld } = require('../src/config/supabase');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── NEW PROJECT CREDENTIALS ─────────────────────────────────────────────────
const NEW_URL = 'https://wwjvfdcfcbdmpkwewflm.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3anZmZGNmY2JkbXBrd2V3ZmxtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDk0MDA2NSwiZXhwIjoyMTEwNTE2MDY1fQ.DUD_BGT6y3GkWkMPOS4WmZdfdHblG_43p1BbtDUyd9M';
const sbNew = createClient(NEW_URL, NEW_KEY);

// OLD PROJECT URL/KEY from env
const OLD_URL = process.env.SUPABASE_URL;
const OLD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── TABLES (order matters for FK constraints) ────────────────────────────────
const DATA_TABLES = [
  { name: 'companies',                select: '*' },
  { name: 'categories',              select: '*' },
  { name: 'users',                   select: '*' },
  { name: 'salesmen',                select: '*' },
  { name: 'suppliers',               select: '*' },
  { name: 'products',                select: '*', transform: rows => rows.map(r => ({
      ...r,
      colors_available: Array.isArray(r.colors_available) ? r.colors_available : null,
      quality_percent: r.quality_percent ? parseFloat(String(r.quality_percent).replace('%','')) || null : null,
    }))},
  { name: 'bank_accounts',           select: '*' },
  { name: 'drivers',                 select: '*' },
  { name: 'vehicles',                select: '*' },
  { name: 'orders',                  select: '*' },
  { name: 'order_items',             select: '*' },
  { name: 'salesman_recoveries',     select: '*' },
  { name: 'ledger_entries',          select: '*' },
  { name: 'supplier_ledger_entries', select: '*' },
  { name: 'expense_accounts',        select: '*' },
  { name: 'expenses',                select: '*' },
  { name: 'bank_ledger_entries',     select: '*' },
  { name: 'cheques',                 select: '*' },
  { name: 'order_returns',           select: '*' },
  { name: 'deleted_invoices', select: 'id,original_order_id,order_number,customer_name,total_amount,invoice_url,deleted_by,deleted_at,reason,original_data',
    transform: rows => rows.map(r => ({ ...r, company_id: null, created_at: r.deleted_at })) },
  { name: 'promo_banners',           select: '*' },
  { name: 'cash_closing_slips',      select: '*' },
  { name: 'driver_recoveries',       select: '*' },
  { name: 'notifications',           select: '*' },
  { name: 'raw_materials', select: 'id,company_id,name,category,unit,stock,min_level,created_at' },
  { name: 'productions',             select: '*' },
  { name: 'manufacturing_heads',     select: '*' },
  { name: 'manufacturing_workers',   select: '*' },
  { name: 'manufacturing_earnings',  select: '*' },
  { name: 'manufacturing_attendance',select: '*' },
];

const PHASE = (process.argv.find(a => a.startsWith('--phase=')) || '').replace('--phase=', '') || 'all';

// ── HELPERS ──────────────────────────────────────────────────────────────────
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

async function upsertBatch(table, rows, conflictCol = 'id') {
  const batchSize = 200;
  let inserted = 0, errors = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sbNew.from(table).upsert(batch, { onConflict: conflictCol, ignoreDuplicates: false });
    if (error) {
      log(`   ❌ ${table} batch ${i}-${i+batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    await sleep(80); // rate limit
  }
  return { inserted, errors };
}

// ── KNOWN PASSWORDS (salesmen from PDF + admins provided by owner) ────────────
const KNOWN_PASSWORDS = {
  // ── Admins ────────────────────────────────────────────────────────────────
  'admin@rhr.com':         'Syedsafeer123',
  'hyd.admin@rhr.com':     'Syedsafeer123',
  'khi.admin@rhr.com':     'RiazHussain',
  'safeer@rhr.com':        'RHRcompany',
  'suk.admin@rhr.com':     'Syedsafeer123',
  'ejaz@rhr.com':          'RHRcompany',
  'asif@rhr.com':          'RHRcompany',
  'rehman@rhr.com':        'RHRcompany',
  // ── Salesmen (from credentials PDF) ──────────────────────────────────────
  'ali@rhr.com':                  'ali12345',
  'arsalan@rhr.com':              'arsalan12345',
  'arshad@rhr.com':               'arshad12345',
  'basit@rhr.com':                'basit12345',
  'fahad@rhr.com':                'fahad12345',
  'mubashir@rhr.com':             'mubashir12345',
  'office@rhr.com':               'office12345',
  's@rhr.com':                    's12345',
  'safeer.salesman@rhr.com':      'safeer12345',
  'shoaib@rhr.com':               'shoaib12345',
  'umair@rhr.com':                'umair12345',
  'waseem@rhr.com':               'waseem12345',
  // ── Additional salesmen ───────────────────────────────────────────────────
  'mejaz@rhr.com':                'mejaz12345',
  'ashfaque@gmail.com':           'ashfaque12345',
  'sukoffice@rhr.com':            'sukoffice12345',
};
const TEMP_PASS = 'RHR@migrate2026'; // fallback for customers / unknown users

// ── PHASE 1: AUTH USERS ──────────────────────────────────────────────────────
async function migrateAuthUsers(dbPassword) {
  log('═══ PHASE 1: AUTH USERS ═══');

  // Fetch all auth users from old project
  let allUsers = [], page = 1;
  while (true) {
    const r = await fetch(`${OLD_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { 'Authorization': `Bearer ${OLD_KEY}`, 'apikey': OLD_KEY }
    });
    const d = await r.json();
    const users = d.users || [];
    if (!users.length) break;
    allUsers.push(...users);
    if (users.length < 1000) break;
    page++;
  }
  log(`   Old project: ${allUsers.length} auth users found`);

  // If dbPassword provided, migrate via postgres (preserves encrypted passwords exactly)
  if (dbPassword) {
    log('   DB password provided — migrating encrypted passwords via postgres...');
    await migrateAuthWithPg(allUsers, dbPassword);
    return;
  }

  log(`   Using known passwords for admins/salesmen, temp password for others`);

  let created = 0, skipped = 0, errors = 0;
  for (const u of allUsers) {
    if (!u.email) { skipped++; continue; }

    const hasEmail = u.email && u.email.trim();
    const hasPhone = u.phone && u.phone.trim();
    if (!hasEmail && !hasPhone) { skipped++; continue; } // no identity — skip

    const password = hasEmail ? (KNOWN_PASSWORDS[u.email.toLowerCase()] || TEMP_PASS) : TEMP_PASS;

    const payload = { id: u.id, email_confirm: true, phone_confirm: true,
      user_metadata: u.user_metadata || {}, app_metadata: u.app_metadata || {} };
    if (hasEmail) { payload.email = u.email; payload.password = password; }
    if (hasPhone) payload.phone = u.phone;
    if (!hasEmail && hasPhone) payload.password = TEMP_PASS; // phone users get temp pass too

    const r = await fetch(`${NEW_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NEW_KEY}`, 'apikey': NEW_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await r.json();
    if (result.id) {
      created++;
    } else if (result.msg?.includes('already') || result.code === '23505' || result.msg?.includes('duplicate')) {
      // Already exists — update password for known users
      const upd = await fetch(`${NEW_URL}/auth/v1/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${NEW_KEY}`, 'apikey': NEW_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      skipped++;
    } else {
      log(`   ❌ ${u.email || u.phone}: ${result.msg || JSON.stringify(result)}`);
      errors++;
    }
    await sleep(30);
  }
  log(`   ✅ Auth: created=${created} skipped=${skipped} errors=${errors}`);
}

async function migrateAuthWithPg(authUsers, dbPassword) {
  const { Client } = require('pg');
  const oldRef = OLD_URL.replace('https://', '').replace('.supabase.co', '');
  const newRef = NEW_URL.replace('https://', '').replace('.supabase.co', '');

  // Get encrypted passwords from old project
  const oldClient = new Client({
    host: `db.${oldRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: process.env.OLD_DB_PASSWORD || dbPassword,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  let encPasswords = {};
  try {
    await oldClient.connect();
    const res = await oldClient.query('SELECT id, encrypted_password FROM auth.users WHERE deleted_at IS NULL');
    for (const row of res.rows) encPasswords[row.id] = row.encrypted_password;
    await oldClient.end();
    log(`   Got ${Object.keys(encPasswords).length} encrypted passwords from old project`);
  } catch (e) {
    log(`   ⚠️  Could not connect to old DB: ${e.message} — using temp password`);
  }

  const newClient = new Client({
    host: `db.${newRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: dbPassword,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await newClient.connect();

  let created = 0, errors = 0;
  for (const u of authUsers) {
    if (!u.email) continue;
    const encPass = encPasswords[u.id];
    try {
      await newClient.query(`
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_sent_at, is_super_admin)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
        ON CONFLICT (id) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password, raw_user_meta_data = EXCLUDED.raw_user_meta_data
      `, [
        u.id,
        u.email,
        encPass || '$2a$10$placeholder', // placeholder if no password
        u.confirmed_at || new Date().toISOString(),
        u.phone || null,
        u.phone_confirmed_at || null,
        JSON.stringify(u.app_metadata || {}),
        JSON.stringify(u.user_metadata || {}),
        u.created_at,
        u.updated_at,
        u.confirmation_sent_at || null,
      ]);
      created++;
    } catch (e) {
      if (!e.message.includes('duplicate') && !e.message.includes('unique')) {
        log(`   ❌ ${u.email}: ${e.message}`);
        errors++;
      }
    }
  }
  await newClient.end();
  log(`   ✅ Auth via PG: created/updated=${created} errors=${errors}`);
}

// ── PHASE 2: TABLE DATA ──────────────────────────────────────────────────────
async function migrateData() {
  log('═══ PHASE 2: TABLE DATA ═══');
  for (const t of DATA_TABLES) {
    log(`📋 ${t.name}...`);
    let rows = await fetchAll(t.name, t.select);
    if (!rows.length) { log(`   (empty)`); continue; }
    if (t.transform) rows = t.transform(rows);
    const { inserted, errors } = await upsertBatch(t.name, rows);
    log(`   ✅ ${inserted} rows | ❌ ${errors} errors`);
  }
}

// ── PHASE 3: STORAGE ─────────────────────────────────────────────────────────
async function migrateStorage() {
  log('═══ PHASE 3: STORAGE FILES ═══');

  const { data: buckets } = await sbOld.storage.listBuckets();
  if (!buckets?.length) { log('   No buckets found'); return; }

  for (const bucket of buckets) {
    log(`🪣  Bucket: ${bucket.name} (public=${bucket.public})`);

    // Ensure bucket exists in new project
    const { error: bucketErr } = await sbNew.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit,
      allowedMimeTypes: bucket.allowed_mime_types,
    });
    if (bucketErr && !bucketErr.message?.includes('already exists')) {
      log(`   ⚠️  Bucket create error: ${bucketErr.message}`);
    }

    // List all files in this bucket
    const allFiles = await listBucketFiles(bucket.name);
    log(`   ${allFiles.length} files to migrate`);

    let done = 0, fail = 0;
    for (const filePath of allFiles) {
      try {
        // Download from old project
        const { data: blob, error: dlErr } = await sbOld.storage.from(bucket.name).download(filePath);
        if (dlErr || !blob) { fail++; continue; }

        // Convert blob to buffer
        const arrayBuf = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        // Upload to new project
        const { error: ulErr } = await sbNew.storage.from(bucket.name).upload(filePath, buffer, {
          upsert: true,
          contentType: blob.type || 'application/octet-stream',
        });

        if (ulErr) { fail++; log(`   ⚠️  ${filePath}: ${ulErr.message}`); }
        else { done++; }
        if (done % 50 === 0) log(`   ... ${done}/${allFiles.length}`);
        await sleep(50);
      } catch (e) {
        fail++;
        log(`   ❌ ${filePath}: ${e.message}`);
      }
    }
    log(`   ✅ ${bucket.name}: uploaded=${done} failed=${fail}`);
  }
}

async function listBucketFiles(bucketName) {
  const all = [];
  async function list(prefix) {
    const { data, error } = await sbOld.storage.from(bucketName).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error || !data) return;
    for (const item of data) {
      const p = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) all.push(p); // file
      else await list(p);       // folder
    }
  }
  await list('');
  return all;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const dbPassword = process.env.NEW_DB_PASSWORD || process.argv.find(a => a.startsWith('--dbpass='))?.replace('--dbpass=', '');

  // Check if pg is available for password migration
  let hasPg = false;
  try { require('pg'); hasPg = true; } catch (_) {}

  log('╔══════════════════════════════════════════════════════════╗');
  log('║          RHR MIGRATION: OLD → NEW SUPABASE PROJECT       ║');
  log('╚══════════════════════════════════════════════════════════╝');
  log(`Old: ${OLD_URL}`);
  log(`New: ${NEW_URL}`);
  log(`Phase: ${PHASE}`);
  log(`DB Password: ${dbPassword ? '✅ provided' : '❌ not provided (temp passwords will be used)'}`);
  log(`pg module: ${hasPg ? '✅' : '❌ run: npm install pg'}`);
  log('');

  if (!OLD_KEY) { log('❌ OLD project service key not found in env'); process.exit(1); }

  if (PHASE === 'schema') {
    log('📄 Schema SQL files are in: D:\\RHR APP Phase 1\\RHR-backend\\sql\\');
    log('   Run all phase*.sql files in order in new project SQL editor.');
    return;
  }

  if (PHASE === 'all' || PHASE === 'auth') {
    await migrateAuthUsers(hasPg ? dbPassword : null);
  }
  if (PHASE === 'all' || PHASE === 'data') {
    await migrateData();
  }
  if (PHASE === 'all' || PHASE === 'storage') {
    await migrateStorage();
  }

  log('');
  log('══════════════════════════════════════════════════════════');
  log('✅ MIGRATION COMPLETE');
  log('══════════════════════════════════════════════════════════');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
