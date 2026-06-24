const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
 
// Regular client — respects RLS policies
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
 
// Service role client — bypasses RLS — use with extreme care
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
 
module.exports = { supabase, supabaseAdmin };