const svc = require('../services/payments.service');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

const createPayment = async (req, res) => {
  try {
    const { customer_id, order_id, amount, method, photo_url, salesman_id } = req.body;
    if (!customer_id || !amount || !photo_url)
      return error(res, 'customer_id, amount, photo_url are required', 400);

    // payments.salesman_id is a NOT NULL FK to salesmen(id) — an admin's
    // own id won't satisfy it, so an admin recording a payment must name
    // the salesman to credit it to (defaults to the customer's assigned
    // one on the frontend).
    const isAdminUser = ['super_admin', 'branch_admin'].includes(req.user.role);
    if (isAdminUser && !salesman_id)
      return error(res, 'salesman_id is required when recording a payment as admin', 400);

    const data = await svc.createPayment({
      companyId:  req.user.company_id,
      customerId: customer_id,
      salesmanId: isAdminUser ? salesman_id : req.user.id,
      orderId:    order_id,
      amount,
      method,
      photoUrl:   photo_url
    });

    // Admin-recorded payments are self-verified — approve immediately
    // (via the same update path the manual Approve button uses) so the
    // ledger credit lands right away instead of sitting in the same
    // review queue as field submissions from salesmen.
    if (isAdminUser) {
      const approved = await svc.reviewPayment(data.id, req.user.company_id, req.user.id, {
        status: 'approved',
        adminNote: 'Auto-approved — recorded directly by admin'
      });
      return success(res, approved, 'Payment recorded and approved.', 201);
    }

    return success(res, data, 'Payment recorded. Pending admin approval.', 201);
  } catch (err) { return error(res, err.message, 400); }
};

const getPayments = async (req, res) => {
  try {
    const data = await svc.getPayments(req.user);
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
    return success(res, data, `Payment ${status}`);
  } catch (err) { return error(res, err.message, 400); }
};

module.exports = { createPayment, getPayments, getPaymentById, reviewPayment };
