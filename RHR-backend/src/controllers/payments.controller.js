const svc = require('../services/payments.service');
const { supabaseAdmin } = require('../config/supabase');
const { pgrestGet } = require('../utils/directQuery');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { sendPaymentReceipt } = require('../services/paymentReceipt.service');
const { notifyUser } = require('../services/notify.service');

const createPayment = async (req, res) => {
  try {
    const { order_id, amount, method, photo_url, salesman_id, bank_account_id, notes, date } = req.body;
    const isCustomerUser = req.user.role === 'customer';
    // A customer can only ever submit a payment for themselves — never
    // trust a client-supplied customer_id for that role. Every other
    // role (admin, salesman) still names who it's for explicitly.
    const customer_id = isCustomerUser ? req.user.id : req.body.customer_id;
    if (!customer_id || !amount)
      return error(res, 'customer_id and amount are required', 400);

    // payments.salesman_id is a NOT NULL FK to salesmen(id) — an admin's
    // own id won't satisfy it, so an admin recording a payment must name
    // the salesman to credit it to (defaults to the customer's assigned
    // one on the frontend). A customer self-submitting doesn't know or
    // choose their salesman either — it's looked up server-side from
    // their own assigned one.
    const isAdminUser = ['super_admin', 'branch_admin'].includes(req.user.role);
    let effectiveSalesmanId = isAdminUser ? salesman_id : req.user.id;
    if (isCustomerUser) {
      const customerRows = await pgrestGet('users', { select: 'salesman_id', id: `eq.${req.user.id}` });
      effectiveSalesmanId = customerRows?.[0]?.salesman_id || null;
      if (!effectiveSalesmanId) return error(res, 'No salesman assigned to your account yet — contact RHR & Company.', 400);
    }
    if (isAdminUser && !salesman_id)
      return error(res, 'salesman_id is required when recording a payment as admin', 400);
    // Photo proof is still required from the salesman mobile app and
    // customer self-service flow — only an admin typing a Recovery entry
    // in directly can skip it.
    if (!isAdminUser && !photo_url)
      return error(res, 'photo_url is required', 400);
    // payments.method is a Postgres enum — 'cash' | 'bank_transfer' |
    // 'credit_account' are the only values it actually accepts (confirmed
    // against the live table; 'bank'/'online' both 400 with "invalid
    // input value for enum payment_method").
    if (method === 'bank_transfer' && !bank_account_id)
      return error(res, 'bank_account_id is required when method is bank_transfer', 400);

    const data = await svc.createPayment({
      companyId:      req.user.company_id,
      customerId:     customer_id,
      salesmanId:     effectiveSalesmanId,
      orderId:        order_id,
      amount,
      method,
      photoUrl:       photo_url,
      bankAccountId:  bank_account_id,
      notes,
      recordedByAdmin: isAdminUser,
      // A salesman reporting a bank transfer may legitimately be logging
      // one that landed a day or two earlier, not necessarily "right
      // now" — admin review (every salesman payment starts 'pending')
      // is the integrity check either way, so this is allowed alongside
      // the admin-recorded case, not gated to admin-only like cash is.
      date: (isAdminUser || method === 'bank_transfer') ? date : null
    });

    if (isCustomerUser && effectiveSalesmanId) {
      await notifyUser({
        companyId: req.user.company_id,
        recipientId: effectiveSalesmanId,
        title: 'Payment Submitted',
        body: `Your customer submitted a PKR ${Number(amount).toLocaleString()} payment — awaiting admin approval`,
        type: 'payment',
        referenceId: data.id,
      });
    }

    // Admin-recorded payments are self-verified — approve immediately
    // (via the same update path the manual Approve button uses) so the
    // ledger credit lands right away instead of sitting in the same
    // review queue as field submissions from salesmen.
    if (isAdminUser) {
      const approved = await svc.reviewPayment(data.id, req.user.company_id, req.user.id, {
        status: 'approved',
        adminNote: 'Auto-approved — recorded directly by admin'
      });
      // Not awaited — a slow/failing WhatsApp send must never delay this
      // response. See paymentReceipt.service.js.
      sendPaymentReceipt(approved);
      return success(res, approved, 'Payment recorded and approved.', 201);
    }

    sendPaymentReceipt(data);

    // Best-effort, never blocks the response — lets the branch (and
    // super_admin, who sees every branch regardless of recipient_role)
    // know a field payment is sitting in the approval queue, same
    // pattern as the new-order notification in orders.service.js.
    try {
      await supabaseAdmin.from('notifications').insert({
        company_id:     req.user.company_id,
        recipient_role: 'branch_admin',
        title:          'New Payment — Pending Approval',
        body:           `PKR ${Number(amount).toLocaleString()} (${method || 'cash'}) submitted, awaiting review`,
        type:           'payment',
        reference_id:   data.id,
      });
    } catch (e) { /* non-fatal */ }

    return success(res, data, 'Payment recorded. Pending admin approval.', 201);
  } catch (err) { return error(res, err.message, 400); }
};

const getPayments = async (req, res) => {
  try {
    const data = await svc.getPayments(req.user, resolveCompanyId(req), req.query.salesman_id, req.query.customer_id);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getPaymentById = async (req, res) => {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from('payments')
      .select('*, users!customer_id(full_name, phone), salesmen!salesman_id(full_name)')
      .eq('id', req.params.id)
      .single();
    if (dbError) return error(res, 'Payment not found', 404);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const reviewPayment = async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!status) return error(res, 'status is required', 400);
    const data = await svc.reviewPayment(
      req.params.id, req.user.company_id, req.user.id,
      { status, adminNote: admin_note }
    );

    if (status === 'approved' && data.salesman_id) {
      await notifyUser({
        companyId: data.company_id,
        recipientId: data.salesman_id,
        title: 'Payment Approved',
        body: `A PKR ${Number(data.amount).toLocaleString()} payment for your customer has been approved`,
        type: 'payment',
        referenceId: data.id,
      });
    }

    return success(res, data, `Payment ${status}`);
  } catch (err) { return error(res, err.message, 400); }
};

module.exports = { createPayment, getPayments, getPaymentById, reviewPayment };
