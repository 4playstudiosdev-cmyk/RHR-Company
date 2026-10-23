const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// GET /api/v1/pending-counts — how many things are waiting on an admin, per
// panel, so the sidebar can badge each panel (and its group) without the admin
// having to open every tab to find out. Keys are the sidebar's own page keys.
// A branch admin sees their own branch; a super admin sees every branch
// (or the one in ?company_id=). Every count is independent — one failing
// lookup reads as 0 and never breaks the rest.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const cf = companyId ? { company_id: `eq.${companyId}` } : {};
    const count = (table, params) => pgrestGet(table, { select: 'id', ...cf, ...params })
      .then((rows) => (rows || []).length)
      .catch(() => 0);

    const [
      customers, salesmen, drivers, orders,
      recoveryPayments, recoveryClosings,
      payments, leave,
    ] = await Promise.all([
      count('users',    { role: 'eq.customer', is_approved: 'eq.false', is_active: 'eq.true' }),
      count('salesmen', { is_approved: 'eq.false', is_active: 'eq.true' }),
      count('drivers',  { is_approved: 'eq.false', is_active: 'eq.true' }),
      count('orders',   { status: 'eq.pending', invoice_deleted_at: 'is.null' }),
      // salesmen's AND drivers' pending online payments / deposits are all approved
      // from Salesman Recovery → Pending Approvals, so they're one count
      count('salesman_recoveries',    { status: 'eq.pending', payment_type: 'neq.cheque' }),
      count('salesman_cash_closings', { status: 'eq.pending' }),
      count('payments', { status: 'eq.pending' }),
      count('leave_requests', { status: 'eq.pending' }),
    ]);

    return success(res, {
      customers,
      salesmen,
      vehicles: drivers, // pending drivers are approved from the Vehicles panel
      orders,
      recovery: recoveryPayments + recoveryClosings,
      payments,
      hrm: leave,
    });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
