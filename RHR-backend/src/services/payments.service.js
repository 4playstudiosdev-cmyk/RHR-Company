const { supabaseAdmin } = require('../config/supabase');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');

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
  // from earlier in the week). A salesman's bank-transfer report can too
  // (see payments.controller.js) — cash stays locked to "now" either way.
  if (date) baseRow.created_at = new Date(date).toISOString();

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

async function getPayments(user, companyIdOverride, salesmanIdFilter, customerIdFilter) {
  const applyFilters = (q) => {
    if (user.role === 'salesman') {
      return q.eq('salesman_id', user.id);
    }
    if (companyIdOverride) q = q.eq('company_id', companyIdOverride);
    if (salesmanIdFilter)  q = q.eq('salesman_id', salesmanIdFilter);
    if (customerIdFilter)  q = q.eq('customer_id', customerIdFilter);
    return q;
  };

  // bank_accounts embed needs payments.bank_account_id (a phase18
  // addition) — fall back to the plain select if that hasn't run yet,
  // so the whole Payments page doesn't break in the meantime.
  try {
    const { data, error } = await applyFilters(
      supabaseAdmin
        .from('payments')
        .select('*, customer:users!customer_id(full_name, shop_name, phone), salesman:salesmen!salesman_id(full_name), bank_accounts(account_name, bank_name)')
        .order('created_at', { ascending: false })
    );
    if (error) throw new Error(error.message);
    return data;
  } catch (e) {
    const { data, error } = await applyFilters(
      supabaseAdmin
        .from('payments')
        .select('*, customer:users!customer_id(full_name, shop_name, phone), salesman:salesmen!salesman_id(full_name)')
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
  if (error) throw new Error(error.message || 'Payment not found');

  // Credits the customer's ledger on approval — this used to rely on a
  // DB trigger (per the old comment here), but that trigger was
  // confirmed (via a live end-to-end test: submit, approve, re-check
  // the ledger) to not actually create anything, leaving every approved
  // payment invisible in both the customer app's and desktop's ledger.
  // Same running-balance computation as recovery.routes.js's
  // creditLedger, reference_type 'payment' instead of 'recovery' to
  // keep these distinguishable.
  if (status === 'approved') {
    const lastEntries = await pgrestGet('ledger_entries', {
      select: 'running_balance',
      customer_id: `eq.${data.customer_id}`,
      order: 'created_at.desc',
      limit: '1',
    });
    const prevBalance = lastEntries?.[0]?.running_balance || 0;
    const newBalance = prevBalance - Number(data.amount);
    await pgrestPost('ledger_entries', {
      company_id: data.company_id,
      customer_id: data.customer_id,
      entry_type: 'credit',
      amount: Number(data.amount),
      running_balance: newBalance,
      description: `Payment approved — ${data.method}`,
      reference_type: 'payment',
      created_by: adminId,
    });
  }

  return data;
}

module.exports = { createPayment, getPayments, reviewPayment };
