const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isSalesman, isDriver } = require('../middleware/role.middleware');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');
const { notifyUser } = require('../services/notify.service');

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

    await notifyUser({
      companyId,
      recipientId: salesman_id,
      title: 'Payment Recorded',
      body: `A PKR ${Number(amount).toLocaleString()} payment was recorded for one of your customers`,
      type: 'payment',
      referenceId: recovery.id,
    });

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

    await notifyUser({
      companyId: recovery.company_id,
      recipientId: recovery.salesman_id,
      title: 'Payment Approved',
      body: `A PKR ${Number(recovery.amount).toLocaleString()} payment for your customer has been approved`,
      type: 'payment',
      referenceId: recovery.id,
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

// ── Reject / delete a pending entry (wrong amount, money never came, duplicate...) ──
// Reject keeps the row (status 'rejected', visible in History) and tells the
// salesman; delete removes it completely. Neither touches a customer's ledger
// or a salesman's cash in hand — those only move when an entry is APPROVED
// (online payments credit the ledger at approval, cash-in-hand counts approved
// closings only) — so only entries that were never approved can be rejected or
// deleted. Approved entries stay: removing one would need its ledger/cash
// effect reversed too.
const scopeFilter = (req) => {
  const filter = { id: `eq.${req.params.id}` };
  if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
  return filter;
};
const rejectionNote = (reason) => (reason ? ` — ${String(reason).slice(0, 200)}` : '');

async function rejectEntry(req, res, table, label) {
  try {
    const rows = await pgrestGet(table, { select: 'id,status,company_id,salesman_id,amount', ...scopeFilter(req) });
    const row = rows?.[0];
    if (!row) return error(res, `${label} not found or access denied`, 404);
    if (row.status !== 'pending') return error(res, `Only a pending ${label.toLowerCase()} can be rejected (this one is ${row.status}).`, 400);

    await pgrestPatch(table, { id: `eq.${row.id}` }, {
      status: 'rejected',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    });
    await notifyUser({
      companyId: row.company_id,
      recipientId: row.salesman_id,
      title: `${label} Rejected`,
      body: `Your ${label.toLowerCase()} of PKR ${Number(row.amount).toLocaleString()} was rejected${rejectionNote(req.body?.reason)}`,
      type: 'payment',
      referenceId: row.id,
    });
    return success(res, { rejected: true }, `${label} rejected`);
  } catch (err) { return error(res, err.message); }
}

async function deleteEntry(req, res, table, label) {
  try {
    const rows = await pgrestGet(table, { select: 'id,status', ...scopeFilter(req) });
    const row = rows?.[0];
    if (!row) return error(res, `${label} not found or access denied`, 404);
    if (row.status === 'approved') return error(res, `An approved ${label.toLowerCase()} can't be deleted — it has already been counted in the books.`, 400);
    await pgrestDelete(table, { id: `eq.${row.id}` });
    return success(res, { deleted: true }, `${label} deleted`);
  } catch (err) { return error(res, err.message); }
}

router.patch('/transactions/:id/reject',   authenticate, isAdmin, (req, res) => rejectEntry(req, res, 'salesman_recoveries', 'Payment'));
router.delete('/transactions/:id',         authenticate, isAdmin, (req, res) => deleteEntry(req, res, 'salesman_recoveries', 'Payment'));
router.patch('/cash-closing/:id/reject',   authenticate, isAdmin, (req, res) => rejectEntry(req, res, 'salesman_cash_closings', 'Deposit'));
router.delete('/cash-closing/:id',         authenticate, isAdmin, (req, res) => deleteEntry(req, res, 'salesman_cash_closings', 'Deposit'));

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

    await notifyUser({
      companyId: updated[0].company_id,
      recipientId: updated[0].salesman_id,
      title: 'Deposit Approved',
      body: `Your deposit of PKR ${Number(updated[0].amount).toLocaleString()} has been approved`,
      type: 'payment',
      referenceId: updated[0].id,
    });

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

// ════════════════════════════════════════════════════════════════
// Self-service — a salesman acting on their own recoveries/cash-in-hand/
// closings, scoped to req.user.id so they can never touch anyone else's.
// Everything above this point stays isAdmin-only (approvals, viewing
// every salesman's data); these are the matching "/me" endpoints the
// Cash Collection screen in the app actually calls.
// ════════════════════════════════════════════════════════════════

// POST /api/v1/recovery/transactions/me — salesman records a cash
// payment they just collected from a customer. Mirrors the admin
// version above (cash auto-approves + credits the ledger immediately)
// but salesman_id is always req.user.id, never client-supplied, and
// only 'cash' is allowed here — an "online" payment collected by a
// salesman still needs an admin to key it in with a reference number,
// not something this self-service endpoint hands out approval for.
router.post('/transactions/me', authenticate, isSalesman, async (req, res) => {
  try {
    const { customer_id, amount, notes, recovery_date, photo_url } = req.body;
    if (!customer_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id and a positive amount are required', 400);

    // approved_by/created_by are FKs to `users(id)` — the admin table —
    // left over from this schema's original admin-only design (see
    // sql/phase27_salesman_recovery.sql). A salesman's own id lives in
    // the separate `salesmen` table and does NOT satisfy that FK, so
    // these must stay null for a self-service entry (confirmed by
    // reproducing a 23503 FK-violation directly against production
    // when this was first set to req.user.id) — salesman_id already
    // identifies who this belongs to either way.
    // photo_url (phase63) — Record Payment's required proof photo, now
    // routed through this same cash-collection flow instead of the old
    // admin-review /payments table. Falls back to inserting without it
    // if that migration hasn't run yet.
    const recoveryRow = {
      company_id:       req.user.company_id,
      salesman_id:      req.user.id,
      customer_id,
      amount:           Number(amount),
      payment_type:     'cash',
      payment_method:   'cash',
      reference_number: null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       null,
    };
    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', { ...recoveryRow, photo_url: photo_url || null });
    } catch (e) {
      [recovery] = await pgrestPost('salesman_recoveries', recoveryRow);
    }

    // Same FK caveat as above — ledger_entries.created_by also only
    // accepts a `users(id)` row, which a salesman's own id isn't.
    await creditLedger({
      companyId: req.user.company_id,
      customerId: customer_id,
      amount: Number(amount),
      description: 'Cash payment received by salesman',
      userId: null,
    });

    return success(res, recovery, 'Cash collection recorded', 201);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/recovery/bank-transfer/me — a customer paying a salesman
// directly via bank transfer (Record Payment's "Bank Transfer" option).
// Unlike a cash collection, this money never sits as physical cash the
// salesman is holding, so it's recorded as already-deposited — credits
// the customer's ledger immediately like the cash flow above, but
// deliberately uses payment_type 'bank' (not 'cash'), which
// my-cash-in-hand's `payment_type: eq.cash` filter already excludes, so
// it never inflates "cash in hand" or needs a later deposit step. Shows
// up in Deposit History via GET /bank-transfers/me below instead.
router.post('/bank-transfer/me', authenticate, isSalesman, async (req, res) => {
  try {
    const { customer_id, amount, bank_account_id, bank_account_label, notes, photo_url } = req.body;
    if (!customer_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id and a positive amount are required', 400);

    const recoveryRow = {
      company_id:       req.user.company_id,
      salesman_id:      req.user.id,
      customer_id,
      amount:           Number(amount),
      payment_type:     'bank',
      payment_method:   'bank_transfer',
      reference_number: bank_account_id || null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      recovery_date:    new Date().toISOString().split('T')[0],
      created_by:       null,
    };
    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', { ...recoveryRow, photo_url: photo_url || null });
    } catch (e) {
      [recovery] = await pgrestPost('salesman_recoveries', recoveryRow);
    }

    await creditLedger({
      companyId: req.user.company_id,
      customerId: customer_id,
      amount: Number(amount),
      description: `Bank transfer received by salesman${bank_account_label ? ` — ${bank_account_label}` : ''}`,
      userId: null,
    });

    return success(res, recovery, 'Bank transfer recorded', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/bank-transfers/me — this salesman's own
// customer-paid-by-bank-transfer history, for Cash Collection's Deposit
// History (merged client-side with GET /cash-closing/me's actual cash
// deposits — these never needed a deposit step, so they don't live in
// salesman_cash_closings at all).
router.get('/bank-transfers/me', authenticate, isSalesman, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_recoveries', {
      select: RECOVERY_SELECT,
      salesman_id: `eq.${req.user.id}`,
      payment_type: 'eq.bank',
      order: 'created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/transactions/me — this salesman's own collection
// history (what "Shows total cash recovered by this salesman" reads).
router.get('/transactions/me', authenticate, isSalesman, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_recoveries', {
      select: RECOVERY_SELECT,
      salesman_id: `eq.${req.user.id}`,
      order: 'created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/my-cash-in-hand — NOT /cash-in-hand/me: that would
// collide with the admin route above (/cash-in-hand/:salesmanId, which
// Express registered first and would match "me" as the param literally).
router.get('/my-cash-in-hand', authenticate, isSalesman, async (req, res) => {
  try {
    const collected = await pgrestGet('salesman_recoveries', {
      select: 'amount',
      salesman_id: `eq.${req.user.id}`,
      payment_type: 'eq.cash',
      status: 'eq.approved',
    });
    const totalCash = (collected || []).reduce((s, r) => s + Number(r.amount), 0);

    const closings = await pgrestGet('salesman_cash_closings', {
      select: 'amount',
      salesman_id: `eq.${req.user.id}`,
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

// A deposit (to the bank or as petty cash) is always the staff member's WHOLE
// cash in hand — the app fills the amount in and doesn't let it be edited, and
// this enforces the same rule for any other client. Cash in hand = approved
// cash collected minus approved deposits (a pending deposit isn't subtracted
// until an admin approves it, so a second deposit is refused while one is
// still waiting — otherwise the same cash could be deposited twice).
// ownerKey: 'salesman_id' | 'driver_id'.
async function checkFullDeposit(ownerKey, ownerId, amount) {
  const [collected, closings] = await Promise.all([
    pgrestGet('salesman_recoveries', { select: 'amount', [ownerKey]: `eq.${ownerId}`, payment_type: 'eq.cash', status: 'eq.approved' }),
    pgrestGet('salesman_cash_closings', { select: 'amount,status', [ownerKey]: `eq.${ownerId}`, status: 'in.(approved,pending)' }),
  ]);
  const sum = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount), 0);
  const approvedClosed = sum((closings || []).filter((c) => c.status === 'approved'));
  const cashInHand = sum(collected) - approvedClosed;

  if ((closings || []).some((c) => c.status === 'pending'))
    return 'You already have a deposit waiting for admin approval. Wait until it is approved before depositing again.';
  if (!(cashInHand > 0)) return 'You have no cash in hand to deposit.';
  if (Math.abs(Number(amount) - cashInHand) > 0.5)
    return `A deposit must be your full cash in hand: PKR ${Math.round(cashInHand).toLocaleString()}.`;
  return null;
}

// POST /api/v1/recovery/cash-closing/me — salesman deposits cash they're
// holding (to the bank, or hands petty cash to the branch). Pending
// until an admin approves it, same as the admin-entered version.
// closing_date is always server-computed as today — never taken from
// the client — so it can't be backdated, matching the spec's "date
// locked to today" requirement for a bank deposit.
router.post('/cash-closing/me', authenticate, isSalesman, async (req, res) => {
  try {
    const { amount, deposit_to, bank_account, slip_image_url, notes } = req.body;
    if (!amount || Number(amount) <= 0)
      return error(res, 'a positive amount is required', 400);
    const method = deposit_to === 'bank' ? 'bank' : 'petty_cash';
    if (method === 'bank' && !slip_image_url)
      return error(res, 'A bank slip photo is required for a bank deposit', 400);
    const fullDepositError = await checkFullDeposit('salesman_id', req.user.id, amount);
    if (fullDepositError) return error(res, fullDepositError, 400);

    // created_by is a `users(id)` FK (admin table) — same caveat as
    // /transactions/me above; salesman_id already identifies the owner.
    const [data] = await pgrestPost('salesman_cash_closings', {
      company_id:     req.user.company_id,
      salesman_id:    req.user.id,
      amount:         Number(amount),
      deposit_to:     method,
      bank_account:   method === 'bank' ? (bank_account || null) : null,
      slip_image_url: method === 'bank' ? (slip_image_url || null) : null,
      notes:          notes || null,
      status:         'pending',
      closing_date:   new Date().toISOString().split('T')[0],
      created_by:     null,
    });

    return success(res, data, 'Deposit submitted — pending admin approval', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/cash-closing/me — this salesman's own deposit history.
router.get('/cash-closing/me', authenticate, isSalesman, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_cash_closings', {
      select: '*',
      salesman_id: `eq.${req.user.id}`,
      order: 'created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// ════════════════════════════════════════════════════════════════
// Driver self-service — identical shape to the salesman "/me" routes
// above, same salesman_recoveries/salesman_cash_closings tables (now
// generalized with a nullable driver_id column — see
// sql/phase58_driver_recovery.sql), just keyed on driver_id instead of
// salesman_id. "Cash Collection" in the driver app is this.
// ════════════════════════════════════════════════════════════════

router.post('/driver-transactions/me', authenticate, isDriver, async (req, res) => {
  try {
    const { customer_id, amount, notes, recovery_date } = req.body;
    if (!customer_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id and a positive amount are required', 400);

    const [recovery] = await pgrestPost('salesman_recoveries', {
      company_id:       req.user.company_id,
      driver_id:        req.user.id,
      customer_id,
      amount:           Number(amount),
      payment_type:     'cash',
      payment_method:   'cash',
      reference_number: null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       null,
    });

    await creditLedger({
      companyId: req.user.company_id,
      customerId: customer_id,
      amount: Number(amount),
      description: 'Cash payment received by driver',
      userId: null,
    });

    return success(res, recovery, 'Cash collection recorded', 201);
  } catch (err) { return error(res, err.message); }
});

router.get('/driver-transactions/me', authenticate, isDriver, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_recoveries', {
      select: RECOVERY_SELECT,
      driver_id: `eq.${req.user.id}`,
      order: 'created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

router.get('/my-driver-cash-in-hand', authenticate, isDriver, async (req, res) => {
  try {
    const collected = await pgrestGet('salesman_recoveries', {
      select: 'amount',
      driver_id: `eq.${req.user.id}`,
      payment_type: 'eq.cash',
      status: 'eq.approved',
    });
    const totalCash = (collected || []).reduce((s, r) => s + Number(r.amount), 0);

    const closings = await pgrestGet('salesman_cash_closings', {
      select: 'amount',
      driver_id: `eq.${req.user.id}`,
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

router.post('/driver-cash-closing/me', authenticate, isDriver, async (req, res) => {
  try {
    const { amount, deposit_to, bank_account, slip_image_url, notes } = req.body;
    if (!amount || Number(amount) <= 0)
      return error(res, 'a positive amount is required', 400);
    const method = deposit_to === 'bank' ? 'bank' : 'petty_cash';
    if (method === 'bank' && !slip_image_url)
      return error(res, 'A bank slip photo is required for a bank deposit', 400);
    const fullDepositError = await checkFullDeposit('driver_id', req.user.id, amount);
    if (fullDepositError) return error(res, fullDepositError, 400);

    const [data] = await pgrestPost('salesman_cash_closings', {
      company_id:     req.user.company_id,
      driver_id:      req.user.id,
      amount:         Number(amount),
      deposit_to:     method,
      bank_account:   method === 'bank' ? (bank_account || null) : null,
      slip_image_url: method === 'bank' ? (slip_image_url || null) : null,
      notes:          notes || null,
      status:         'pending',
      closing_date:   new Date().toISOString().split('T')[0],
      created_by:     null,
    });

    return success(res, data, 'Deposit submitted — pending admin approval', 201);
  } catch (err) { return error(res, err.message); }
});

router.get('/driver-cash-closing/me', authenticate, isDriver, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_cash_closings', {
      select: '*',
      driver_id: `eq.${req.user.id}`,
      order: 'created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// ════════════════════════════════════════════════════════════════
// Driver Recovery panel (admin only) — a plain log of cash a driver
// has physically handed over to/received from a salesman. No ledger
// write here on purpose (see sql/phase58_driver_recovery.sql's comment
// on driver_cash_handoffs) — the underlying customer payment was
// already credited wherever it was actually collected; this is just
// an internal cash-custody record for admin to look up.
// ════════════════════════════════════════════════════════════════

router.get('/driver-handoffs', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,driver_id,salesman_id,amount,notes,created_at,drivers(full_name,car_number),salesmen(full_name)',
      order: 'created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('driver_cash_handoffs', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

router.post('/driver-handoffs', authenticate, isAdmin, async (req, res) => {
  try {
    const { driver_id, salesman_id, amount, notes } = req.body;
    if (!driver_id || !amount || Number(amount) <= 0)
      return error(res, 'driver_id and a positive amount are required', 400);

    const [data] = await pgrestPost('driver_cash_handoffs', {
      company_id:  req.user.company_id,
      driver_id,
      salesman_id: salesman_id || null,
      amount:      Number(amount),
      notes:       notes || null,
      created_by:  req.user.id,
    });

    return success(res, data, 'Handoff recorded', 201);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
