const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');

// Salesman Recovery — cash/online payment collections plus end-of-day
// cash-in-hand closings. Separate from the existing /payments table:
// this adds a cash-in-hand running balance per salesman and a closing/
// deposit reconciliation step that payments has no concept of.
// See sql/phase27_salesman_recovery.sql.
//
// All reads go through the pgrestGet raw-https bypass (see
// utils/directQuery.js) — this codebase has a proven, documented
// Railway/supabase-js bug where plain supabase-js reads silently return
// an empty array despite matching rows existing; every other list
// endpoint added since that was found uses this bypass instead.

// Ledger credit helper — same running-balance computation used by
// POST /ledger/adjustment and the order-return flow. ledger_entries has
// no reference_id column (only reference_type), so that's all that's
// recorded here to tie the entry back to "recovery".
async function creditLedger({ companyId, customerId, amount, description, userId }) {
  const lastEntries = await pgrestGet('ledger_entries', {
    select: 'running_balance',
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
    limit: '1',
  });
  const prevBalance = lastEntries?.[0]?.running_balance || 0;
  const newBalance = prevBalance - Number(amount);

  await pgrestPost('ledger_entries', {
    company_id: companyId,
    customer_id: customerId,
    entry_type: 'credit',
    amount: Number(amount),
    running_balance: newBalance,
    description,
    reference_type: 'recovery',
    created_by: userId,
  });
}

// GET /api/v1/recovery/transactions
const RECOVERY_SELECT = 'id,company_id,salesman_id,customer_id,amount,payment_type,payment_method,reference_number,notes,status,approved_by,approved_at,recovery_date,created_at,salesmen(id,full_name),users!customer_id(id,full_name,phone,shop_name)';

router.get('/transactions', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { salesman_id, status } = req.query;

    const params = { select: RECOVERY_SELECT, order: 'created_at.desc' };
    if (companyId)   params.company_id  = `eq.${companyId}`;
    if (salesman_id) params.salesman_id = `eq.${salesman_id}`;
    if (status)      params.status      = `eq.${status}`;

    const data = await pgrestGet('salesman_recoveries', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/recovery/transactions — cash auto-approves (and credits
// the customer's ledger immediately); online sits pending until an
// admin approves it from the Pending Approvals tab.
router.post('/transactions', authenticate, isAdmin, async (req, res) => {
  try {
    const {
      salesman_id, customer_id, amount,
      payment_type, payment_method,
      reference_number, notes, recovery_date
    } = req.body;

    if (!salesman_id || !customer_id || !amount || !payment_type)
      return error(res, 'salesman_id, customer_id, amount, payment_type are required', 400);
    if (!['cash', 'online'].includes(payment_type))
      return error(res, 'payment_type must be cash or online', 400);

    const isCash = payment_type === 'cash';
    const companyId = req.user.company_id;

    const [recovery] = await pgrestPost('salesman_recoveries', {
      company_id:       companyId,
      salesman_id,
      customer_id,
      amount:           Number(amount),
      payment_type,
      payment_method:   payment_method || payment_type,
      reference_number: reference_number || null,
      notes:            notes || null,
      status:           isCash ? 'approved' : 'pending',
      approved_by:      isCash ? req.user.id : null,
      approved_at:      isCash ? new Date().toISOString() : null,
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       req.user.id,
    });

    if (isCash) {
      await creditLedger({
        companyId,
        customerId: customer_id,
        amount: Number(amount),
        description: 'Cash payment received by salesman',
        userId: req.user.id,
      });
    }

    return success(res, recovery,
      isCash ? 'Cash payment recorded & auto-approved' : 'Online payment recorded — pending approval',
      201);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/transactions/:id/approve — admin approves an
// online payment; credits the customer's ledger at that point (cash
// entries are already credited at creation).
router.patch('/transactions/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const rows = await pgrestGet('salesman_recoveries', { select: '*', ...filter });
    const recovery = rows?.[0];
    if (!recovery) return error(res, 'Transaction not found or access denied', 404);
    if (recovery.status === 'approved') return error(res, 'Already approved', 400);

    await pgrestPatch('salesman_recoveries', { id: `eq.${req.params.id}` }, {
      status: 'approved',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    });

    await creditLedger({
      companyId: recovery.company_id,
      customerId: recovery.customer_id,
      amount: Number(recovery.amount),
      description: `Online payment approved — ${recovery.payment_method}`,
      userId: req.user.id,
    });

    return success(res, { approved: true }, 'Payment approved — customer balance updated');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/cash-in-hand/:salesmanId — total approved cash
// collected minus total approved cash closings (deposits), i.e. what
// this salesman is still holding.
router.get('/cash-in-hand/:salesmanId', authenticate, isAdmin, async (req, res) => {
  try {
    const collected = await pgrestGet('salesman_recoveries', {
      select: 'amount',
      salesman_id: `eq.${req.params.salesmanId}`,
      payment_type: 'eq.cash',
      status: 'eq.approved',
    });
    const totalCash = (collected || []).reduce((s, r) => s + Number(r.amount), 0);

    const closings = await pgrestGet('salesman_cash_closings', {
      select: 'amount',
      salesman_id: `eq.${req.params.salesmanId}`,
      status: 'eq.approved',
    });
    const totalClosed = (closings || []).reduce((s, c) => s + Number(c.amount), 0);

    return success(res, {
      cash_in_hand:    totalCash - totalClosed,
      total_collected: totalCash,
      total_deposited: totalClosed,
    });
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/recovery/cash-closing — salesman/admin submits an
// end-of-day deposit of cash held; sits pending until an admin approves it.
router.post('/cash-closing', authenticate, isAdmin, async (req, res) => {
  try {
    const { salesman_id, amount, deposit_to, bank_account, notes } = req.body;
    if (!salesman_id || !amount || Number(amount) <= 0)
      return error(res, 'salesman_id and a positive amount are required', 400);

    const [data] = await pgrestPost('salesman_cash_closings', {
      company_id:   req.user.company_id,
      salesman_id,
      amount:       Number(amount),
      deposit_to:   deposit_to === 'petty_cash' ? 'petty_cash' : 'bank',
      bank_account: bank_account || null,
      notes:        notes || null,
      status:       'pending',
      closing_date: new Date().toISOString().split('T')[0],
      created_by:   req.user.id,
    });

    return success(res, data, 'Cash closing submitted — pending admin approval', 201);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/cash-closing/:id/approve
router.patch('/cash-closing/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const updated = await pgrestPatch('salesman_cash_closings', filter, {
      status: 'approved',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    });
    if (!updated?.[0]) return error(res, 'Cash closing not found or access denied', 404);
    return success(res, { approved: true }, 'Cash closing approved — salesman balance cleared');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/pending-approvals — everything waiting on an
// admin: pending online payments + pending cash closings, for one badge.
router.get('/pending-approvals', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);

    const paymentParams = { select: RECOVERY_SELECT, status: 'eq.pending', order: 'created_at.desc' };
    const closingParams = {
      select: 'id,company_id,salesman_id,amount,deposit_to,bank_account,notes,status,closing_date,created_at,salesmen(full_name)',
      status: 'eq.pending',
      order: 'created_at.desc',
    };
    if (companyId) {
      paymentParams.company_id = `eq.${companyId}`;
      closingParams.company_id = `eq.${companyId}`;
    }

    const [onlinePayments, cashClosings] = await Promise.all([
      pgrestGet('salesman_recoveries', paymentParams),
      pgrestGet('salesman_cash_closings', closingParams),
    ]);

    return success(res, {
      online_payments: onlinePayments || [],
      cash_closings:   cashClosings || [],
      total_pending:   (onlinePayments?.length || 0) + (cashClosings?.length || 0),
    });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
