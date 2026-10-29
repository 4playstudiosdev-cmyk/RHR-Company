/**
 * One-time script: give every salesman an email+password Supabase Auth credential.
 *
 * Email format  : <first_word_of_full_name_lowercase>@rhr.com
 * Password format: <first_word_of_full_name_lowercase>12345
 *
 * Existing phone-OTP auth on each account is preserved — Supabase Auth
 * supports multiple providers on one user, so salesmen can still log in via
 * OTP once WhatsApp is back.
 *
 * Run once from the RHR-backend folder:
 *   node scripts/setup-salesman-emails.js
 */

'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function deriveCredentials(fullName) {
  const firstName = (fullName || '').trim().split(/\s+/)[0].toLowerCase();
  return { email: `${firstName}@rhr.com`, password: `${firstName}12345` };
}

async function run() {
  console.log('Fetching all salesmen…');
  const { data: salesmen, error: fetchErr } = await supabaseAdmin
    .from('salesmen')
    .select('id, full_name, email');

  if (fetchErr) { console.error('Failed to fetch salesmen:', fetchErr.message); process.exit(1); }
  console.log(`Found ${salesmen.length} salesman(s)\n`);

  for (const s of salesmen) {
    const { email, password } = deriveCredentials(s.full_name);
    process.stdout.write(`  ${s.full_name.padEnd(28)} → ${email.padEnd(26)} / ${password}  …`);

    // 1. Set email+password on the Supabase Auth user
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(s.id, {
      email,
      password,
      email_confirm: true,
    });

    if (authErr) {
      console.log(` FAILED (auth): ${authErr.message}`);
      continue;
    }

    // 2. Store email in salesmen table so the login endpoint can look up by it
    const { error: tableErr } = await supabaseAdmin
      .from('salesmen')
      .update({ email })
      .eq('id', s.id);

    if (tableErr) {
      console.log(` FAILED (table): ${tableErr.message}`);
    } else {
      console.log(' OK');
    }
  }

  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
