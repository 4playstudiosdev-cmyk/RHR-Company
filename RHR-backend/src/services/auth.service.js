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

// Convert local Pakistani number to E.164 required by Supabase Auth
// 03001234567 → +923001234567
function toE164(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  return '+' + digits;
}

async function registerCustomer({ phone, fullName, companyId }) {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id, is_approved')
    .eq('phone', phone)
    .single();

  if (existing) {
    if (existing.is_approved) throw new Error('Phone number already registered and approved');
    throw new Error('Account already exists. Pending admin approval.');
  }

  // Supabase Auth requires E.164 format (+923001234567)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    phone: toE164(phone),
    phone_confirm: true,
    user_metadata: { full_name: fullName, role: 'customer' }
  });

  if (authError) throw new Error(authError.message);

  const { data: newUser, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id:          authData.user.id,
      company_id:  companyId,
      role:        'customer',
      full_name:   fullName,
      phone,
      is_approved: false
    })
    .select()
    .single();

  if (userError) throw new Error(userError.message);

  return newUser;
}

async function loginWithCredentials({ email, password }) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .in('role', ['super_admin', 'branch_admin', 'salesman', 'delivery'])
    .single();

  if (error || !user) throw new Error('Invalid email or password');
  if (!user.is_active) throw new Error('Account has been deactivated');

  const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error('Invalid email or password');

  const token = generateToken(user);

  return {
    token,
    user: {
      id:        user.id,
      fullName:  user.full_name,
      role:      user.role,
      companyId: user.company_id,
      phone:     user.phone
    }
  };
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

module.exports = { registerCustomer, loginWithCredentials, approveCustomer, generateToken };
