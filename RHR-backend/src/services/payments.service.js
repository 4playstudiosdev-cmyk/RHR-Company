const { supabaseAdmin } = require('../config/supabase');

async function createPayment({ companyId, customerId, salesmanId, orderId, amount, method, photoUrl }) {
  if (!photoUrl) throw new Error('Photo proof is required for all payments');

  const { data, error } = await supabaseAdmin
    .from('payments')
    .insert({
      company_id:  companyId,
      customer_id: customerId,
      salesman_id: salesmanId,
      order_id:    orderId || null,
      amount,
      method:      method || 'cash',
      status:      'pending',
      photo_url:   photoUrl
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function getPayments(user) {
  let query = supabaseAdmin
    .from('payments')
    .select('*, customer:users!customer_id(full_name, phone), salesman:users!salesman_id(full_name)')
    .order('created_at', { ascending: false });

  if (user.role === 'salesman') {
    query = query.eq('salesman_id', user.id);
  } else if (user.company_id) {
    query = query.eq('company_id', user.company_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function reviewPayment(id, companyId, adminId, { status, adminNote }) {
  if (!['approved', 'rejected'].includes(status))
    throw new Error('Status must be approved or rejected');

  let query = supabaseAdmin
    .from('payments')
    .update({
      status,
      admin_note:  adminNote || null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', id);

  // super_admin has no company_id — skip scope filter
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query.select().single();
  // Note: ledger CREDIT entry is auto-created by DB trigger on approval
  if (error) throw new Error(error.message || 'Payment not found');
  return data;
}

module.exports = { createPayment, getPayments, reviewPayment };
