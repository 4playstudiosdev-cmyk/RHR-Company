const { supabaseAdmin } = require('../config/supabase');

// photoUrl is required for the salesman mobile-app flow (field proof of
// a cash/receipt handoff) but not for a Recovery entry an admin types in
// directly at the office — recordedByAdmin relaxes that one requirement
// without touching the mobile flow's validation.
async function createPayment({ companyId, customerId, salesmanId, orderId, amount, method, photoUrl, bankAccountId, notes, recordedByAdmin, date }) {
  if (!photoUrl && !recordedByAdmin) throw new Error('Photo proof is required for all payments');

  const baseRow = {
    company_id:  companyId,
    customer_id: customerId,
    salesman_id: salesmanId,
    order_id:    orderId || null,
    amount,
    method:      method || 'cash',
    status:      'pending',
    photo_url:   photoUrl || null
  };
  // Admin-recorded recoveries can be backdated (e.g. logging a collection
  // from earlier in the week) — the mobile salesman flow always uses "now".
  if (recordedByAdmin && date) baseRow.created_at = new Date(date).toISOString();

  // bank_account_id/notes are a phase18 addition — fall back to
  // inserting without them if that migration hasn't run yet, rather
  // than breaking every payment submission (including the live
  // salesman mobile flow).
  try {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert({ ...baseRow, bank_account_id: bankAccountId || null, notes: notes || null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  } catch (e) {
    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert(baseRow)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}

async function getPayments(user, companyIdOverride, salesmanIdFilter) {
  const applyFilters = (q) => {
    if (user.role === 'salesman') {
      return q.eq('salesman_id', user.id);
    }
    if (companyIdOverride) q = q.eq('company_id', companyIdOverride);
    if (salesmanIdFilter)  q = q.eq('salesman_id', salesmanIdFilter);
    return q;
  };

  // bank_accounts embed needs payments.bank_account_id (a phase18
  // addition) — fall back to the plain select if that hasn't run yet,
  // so the whole Payments page doesn't break in the meantime.
  try {
    const { data, error } = await applyFilters(
      supabaseAdmin
        .from('payments')
        .select('*, customer:users!customer_id(full_name, phone), salesman:salesmen!salesman_id(full_name), bank_accounts(account_name, bank_name)')
        .order('created_at', { ascending: false })
    );
    if (error) throw new Error(error.message);
    return data;
  } catch (e) {
    const { data, error } = await applyFilters(
      supabaseAdmin
        .from('payments')
        .select('*, customer:users!customer_id(full_name, phone), salesman:salesmen!salesman_id(full_name)')
        .order('created_at', { ascending: false })
    );
    if (error) throw new Error(error.message);
    return data;
  }
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
