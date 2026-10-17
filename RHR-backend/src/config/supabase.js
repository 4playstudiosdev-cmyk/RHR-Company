const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase's REST API sits behind Cloudflare (confirmed via DNS — its
// hostname resolves to Cloudflare IPs). Testing suspects a CDN/edge layer
// is caching an occasional genuinely-empty response for these GET
// requests and then serving that same stale empty body on repeat,
// identical, authenticated calls — every attempt logged 200 on
// Supabase's own side, never an error, which is what a cache hit on a
// stale empty response would look like from outside. These headers ask
// every layer in between not to do that.
const noCacheHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
};

// Regular client — respects RLS policies
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { global: { headers: noCacheHeaders } }
);

// Service role client — bypasses RLS — use with extreme care
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { headers: noCacheHeaders } }
);

// A throwaway client for verifying a user's password. signInWithPassword
// stores the signed-in user's session on whichever client it's called on,
// and every later query on that client then runs as that user (RLS
// applies) instead of the key it was created with. Calling it on
// supabaseAdmin silently turned the shared service-role client into an
// "authenticated" one after the first admin login — "new row violates
// row-level security policy" on writes to RLS-protected tables like
// productions. A fresh, non-persisting client per call can't leak that.
const createAuthClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

module.exports = { supabase, supabaseAdmin, createAuthClient };