const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, companyId: user.company_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

function normalizePhone(phone) {
  // Strip non-digits: 03001234567 → 03001234567, +923001234567 → 923001234567
  let digits = phone.replace(/\D/g, '');
  // Pakistani local format starts with 0 → replace with country code 92
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  return '+' + digits; // → +923001234567
}

// Supabase Auth users are created before the profile row (users/salesmen).
// If that profile insert ever fails — bad companyId, a dropped connection,
// the table not existing yet during a migration window — the Auth user is
// left behind with no matching profile row. Since Auth enforces unique
// phones, every retry then fails with "already registered" even though
// there's no visible account anywhere. This finds that orphan so
// registration can resume on it instead of dying forever.
async function findAuthUserByPhone(bare) {
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(u => u.phone === bare);
    if (match) return match;
    if (data.users.length < 200) return null;
    page++;
  }
}

async function getOrCreateAuthUser({ canonical, bare, fullName, role }) {
  const orphan = await findAuthUserByPhone(bare);
  if (orphan) return orphan.id;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    phone: canonical,
    phone_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (authError) throw new Error(authError.message);
  return authData.user.id;
}

async function registerCustomer({ phone, fullName, companyId, shopName, shopAddress }) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, is_approved')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  // Supabase Auth requires E.164 format (+923001234567)
  const authUserId = await getOrCreateAuthUser({ canonical, bare, fullName, role: 'customer' });

  const { data: newUser, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id:           authUserId,
      company_id:   companyId,
      role:         'customer',
      full_name:    fullName,
      phone:        canonical,   // always store in +92XXXXXXXXXX format
      shop_name:    shopName    || null,
      shop_address: shopAddress || null,
      is_approved:  false
    })
    .select()
    .single();

  if (userError) throw new Error(userError.message);

  return newUser;
}

async function loginWithCredentials({ email, password }) {
  // Salesmen log in via phone + OTP now (see findSalesmanByPhone /
  // registerSalesman) — only admin/delivery roles still use email+password.
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .in('role', ['super_admin', 'branch_admin', 'delivery'])
    .single();

  if (error || !user) throw new Error('Invalid email or password');
  if (!user.is_active) throw new Error('Account has been deactivated');

  const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error('Invalid email or password');

  const token = generateToken(user);

  return {
    token,
    user: {
      id:          user.id,
      fullName:    user.full_name,
      role:        user.role,
      companyId:   user.company_id,
      phone:       user.phone,
      // Present regardless of whether the phase10 migration (adding the
      // permissions column) has been run yet — select('*') above just
      // omits the key entirely if the column doesn't exist, so this
      // never throws either way.
      permissions: user.permissions || {}
    }
  };
}

async function registerSalesman({ phone, fullName, companyId, position }) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: existing } = await supabaseAdmin
    .from('salesmen')
    .select('id, is_approved')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  const authUserId = await getOrCreateAuthUser({ canonical, bare, fullName, role: 'salesman' });

  const { data: newSalesman, error: salesmanError } = await supabaseAdmin
    .from('salesmen')
    .insert({
      id:          authUserId,
      company_id:  companyId,
      full_name:   fullName,
      phone:       canonical,
      position:    position || null,
      is_approved: false
    })
    .select()
    .single();

  if (salesmanError) throw new Error(salesmanError.message);

  return newSalesman;
}

async function approveCustomer(customerId, adminUser) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ is_approved: true })
    .eq('id', customerId)
    .eq('company_id', adminUser.company_id)
    .eq('role', 'customer')
    .select()
    .single();

  if (error) throw new Error('Customer not found or access denied');
  return data;
}

async function findCustomerByPhone(phone) {
  const canonical = normalizePhone(phone);          // +923001234567
  const bare      = canonical.replace('+', '');    // 923001234567

  // Match either storage format — whatever was used at registration time
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .eq('role', 'customer')
    .maybeSingle();

  if (error) console.error('findCustomerByPhone error:', error.message);
  return user || null;
}

async function findSalesmanByPhone(phone) {
  const canonical = normalizePhone(phone);
  const bare      = canonical.replace('+', '');

  const { data: salesman, error } = await supabaseAdmin
    .from('salesmen')
    .select('*')
    .or(`phone.eq.${canonical},phone.eq.${bare}`)
    .maybeSingle();

  if (error) console.error('findSalesmanByPhone error:', error.message);
  if (!salesman) return null;
  // salesmen has no `role` column (the table itself is the discriminator) —
  // callers (sendOTPHandler/verifyOTPHandler/generateToken) expect one.
  return { ...salesman, role: 'salesman' };
}

async function approveSalesman(salesmanId, adminUser) {
  const { data, error } = await supabaseAdmin
    .from('salesmen')
    .update({ is_approved: true })
    .eq('id', salesmanId)
    .eq('company_id', adminUser.company_id)
    .select()
    .single();

  if (error) throw new Error('Salesman not found or access denied');
  return data;
}

module.exports = {
  registerCustomer, registerSalesman,
  loginWithCredentials,
  approveCustomer, approveSalesman,
  generateToken,
  findCustomerByPhone, findSalesmanByPhone
};
