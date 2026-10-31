const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isSalesman, isDriver } = require('../middleware/role.middleware');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');
const { notifyUser } = require('../services/notify.service');
const paymentMessages = require('../services/paymentMessages.service');

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
// photo_url (the proof photo Record Payment takes) was added by
// sql/phase63_recovery_photo_proof.sql. Until that has been run in Supabase the
// column doesn't exist and selecting it fails, so it's only added when present
// (checked once, then remembered) — the lists keep working either way.
let photoColumnKnown = null; // null = not checked yet
async function hasPhotoColumn() {
  if (photoColumnKnown !== null) return photoColumnKnown;
  try {
    await pgrestGet('salesman_recoveries', { select: 'photo_url', limit: '1' });
    photoColumnKnown = true;
  } catch (e) {
    return false; // don't cache a failure — the SQL may be run any moment
  }
  return photoColumnKnown;
}
// cheque_* columns (phase72) — same "only when present" treatment as photo_url.
const CHEQUE_COLUMNS = 'cheque_number,cheque_bank,cheque_date,cheque_status,cleared_at,cleared_to,return_reason,cleared_bank:bank_accounts!cleared_bank_account_id(account_name,bank_name)';
let chequeColumnsKnown = null;
async function hasChequeColumns() {
  if (chequeColumnsKnown !== null) return chequeColumnsKnown;
  try {
    await pgrestGet('salesman_recoveries', { select: 'cheque_status', limit: '1' });
    chequeColumnsKnown = true;
  } catch (e) {
    return false;
  }
  return chequeColumnsKnown;
}
// removed_* columns (phase73) — who rejected/deleted a payment, when and why.
const REMOVED_COLUMNS = 'removed_reason,removed_at,remover:users!removed_by(full_name)';
let removedColumnsKnown = null;
async function hasRemovedColumns() {
  if (removedColumnsKnown !== null) return removedColumnsKnown;
  try {
    await pgrestGet('salesman_recoveries', { select: 'removed_reason', limit: '1' });
    removedColumnsKnown = true;
  } catch (e) {
    return false;
  }
  return removedColumnsKnown;
}
const withPhoto = async (select) => {
  let out = select;
  if (await hasRemovedColumns()) out = out.replace('reference_number,', `reference_number,${REMOVED_COLUMNS},`);
  if (await hasPhotoColumn()) out = out.replace('reference_number,', 'reference_number,photo_url,');
  if (await hasChequeColumns()) out = out.replace('reference_number,', `reference_number,${CHEQUE_COLUMNS},`);
  return out;
};

const RECOVERY_SELECT = 'id,company_id,salesman_id,customer_id,amount,payment_type,payment_method,reference_number,notes,status,approved_by,approved_at,recovery_date,created_at,salesmen(id,full_name),users!customer_id(id,full_name,phone,shop_name)';

router.get('/transactions', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { salesman_id, status } = req.query;

    const params = { select: await withPhoto(RECOVERY_SELECT), order: 'created_at.desc' };
    if (companyId)   params.company_id  = `eq.${companyId}`;
    if (salesman_id) params.salesman_id = `eq.${salesman_id}`;
    params.status = status ? `eq.${status}` : 'neq.deleted';

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
    if (!['cash', 'online', 'cheque'].includes(payment_type))
      return error(res, 'payment_type must be cash, online or cheque', 400);

    if (payment_type === 'cheque') {
      const recovery = await createChequeRecovery({
        companyId: req.user.company_id, salesmanId: salesman_id, customerId: customer_id, amount,
        chequeBank: req.body.cheque_bank, chequeNumber: req.body.cheque_number, chequeDate: req.body.cheque_date,
        notes, photoUrl: req.body.photo_url, createdBy: req.user.id, recoveryDate: recovery_date,
        notifyAdminsFrom: null,
      });
      return success(res, recovery, 'Cheque recorded — pending until it clears', 201);
    }

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

    // Tell the customer on WhatsApp: cash = received (with their outstanding
    // balance), online = pending until approved.
    if (isCash) paymentMessages.paymentReceived({ customerId: customer_id, amount, method: 'cash' });
    else paymentMessages.paymentPending({ customerId: customer_id, amount });

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
  } catch (err) { return error(res, err.message, err.status || 500); }
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
    if (recovery.payment_type === 'cheque') return error(res, 'A cheque is not approved — mark it Cleared (and choose where the money went) from the Cheques tab.', 400);

    await pgrestPatch('salesman_recoveries', { id: `eq.${req.params.id}` }, {
      status: 'approved',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    });

    await creditLedger({
      companyId: recovery.company_id,
      customerId: recovery.customer_id,
      amount: Number(recovery.amount),
      description: recovery.payment_method === 'bank_transfer' ? 'Bank transfer approved' : `Online payment approved — ${recovery.payment_method}`,
      userId: req.user.id,
    });

    paymentMessages.paymentReceived({
      customerId: recovery.customer_id,
      amount: recovery.amount,
      method: recovery.payment_method,
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

    const rejectPatch = { status: 'rejected', approved_by: req.user.id, approved_at: new Date().toISOString() };
    if (table === 'salesman_recoveries') {
      // phase73 columns remember who rejected it and why; older databases just skip them
      await pgrestPatch(table, { id: `eq.${row.id}` }, {
        ...rejectPatch, removed_reason: String(req.body?.reason || '').slice(0, 200) || null,
        removed_by: req.user.id, removed_at: new Date().toISOString(),
      }).catch(() => pgrestPatch(table, { id: `eq.${row.id}` }, rejectPatch));
    } else {
      await pgrestPatch(table, { id: `eq.${row.id}` }, rejectPatch);
    }
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

// Pending / rejected entries never touched the books, so they simply go. An APPROVED
// payment (salesman_recoveries) did: the customer's ledger was credited when it was
// approved. Deleting it (e.g. it was entered twice by accident) therefore also reverses
// that credit — a debit entry for the same amount is posted, so the customer owes again
// exactly what they would have without the payment, and the ledger keeps a visible trail.
// The salesman's cash in hand is worked out from approved payments, so it drops by itself.
// An approved deposit (cash closing) is still refused: it has money-movement consequences
// that can't be undone from here.
async function debitLedger({ companyId, customerId, amount, description, userId }) {
  const lastEntries = await pgrestGet('ledger_entries', {
    select: 'running_balance',
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
    limit: '1',
  });
  const prevBalance = Number(lastEntries?.[0]?.running_balance) || 0;
  await pgrestPost('ledger_entries', {
    company_id: companyId,
    customer_id: customerId,
    entry_type: 'debit',
    amount: Number(amount),
    running_balance: prevBalance + Number(amount),
    description,
    reference_type: 'adjustment',
    created_by: userId,
  });
}

// A deleted payment is NOT erased: it stays with status 'deleted' (every total only counts
// approved ones, so it counts nowhere) and shows up in Salesman Recovery → Rejected / Deleted
// with who removed it and why. Deposits (cash closings) are still removed outright.
async function removeRow(table, row, reason, adminId) {
  if (table !== 'salesman_recoveries') return pgrestDelete(table, { id: `eq.${row.id}` });
  const base = { status: 'deleted' };
  return pgrestPatch(table, { id: `eq.${row.id}` }, {
    ...base, removed_reason: reason, removed_by: adminId, removed_at: new Date().toISOString(),
  }).catch(() => pgrestPatch(table, { id: `eq.${row.id}` }, {
    ...base, notes: [row.notes, `Removed: ${reason}`].filter(Boolean).join(' · '),
  }));
}

async function deleteEntry(req, res, table, label) {
  try {
    // Removing a payment / deposit always needs a written reason (kept in the ledger and
    // shown to the salesman), so nothing disappears without an explanation.
    const reason = String(req.body?.reason || req.query?.reason || '').trim().slice(0, 200);
    if (reason.length < 3) return error(res, 'A reason is required to delete this (at least 3 characters).', 400);
    const adminName = req.user.full_name || 'admin';
    const isPayment = table === 'salesman_recoveries';
    const rows = await pgrestGet(table, {
      select: isPayment ? 'id,status,company_id,salesman_id,customer_id,amount,payment_type,payment_method,recovery_date,notes,users!customer_id(full_name,shop_name)' : 'id,status',
      ...scopeFilter(req),
    });
    const row = rows?.[0];
    if (!row) return error(res, `${label} not found or access denied`, 404);
    if (row.status === 'deleted') return error(res, `This ${label.toLowerCase()} was already deleted.`, 400);

    if (row.status === 'approved') {
      if (!isPayment) return error(res, `An approved ${label.toLowerCase()} can't be deleted — it has already been counted in the books.`, 400);
      const who = row.users?.shop_name || row.users?.full_name || 'customer';
      // reverse the ledger credit first; if that fails the payment stays, nothing is half-done
      if (row.customer_id) {
        await debitLedger({
          companyId: row.company_id,
          customerId: row.customer_id,
          amount: row.amount,
          description: `Payment of PKR ${Number(row.amount).toLocaleString('en-US')} removed by ${adminName} — reason: ${reason} — balance restored`,
          userId: req.user.id,
        });
      }
      await removeRow(table, row, reason, req.user.id);
      if (row.salesman_id) {
        notifyUser({
          companyId: row.company_id,
          recipientId: row.salesman_id,
          title: 'Payment removed',
          body: `Your PKR ${Number(row.amount).toLocaleString('en-US')} payment from ${who} was removed by the office. Reason: ${reason}`,
          type: 'payment',
        });
      }
      return success(res, { deleted: true, reversed: true }, `${label} deleted and the customer's balance restored`);
    }

    await removeRow(table, row, reason, req.user.id);
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

    // a cheque stays pending until the bank clears it (days/weeks) — it lives in the Cheques tab, not here
    const paymentParams = { select: await withPhoto(RECOVERY_SELECT), status: 'eq.pending', payment_type: 'neq.cheque', order: 'created_at.desc' };
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

// ── Cheques ──
// A cheque is recorded with its details (bank, number, date) and stays PENDING. Nothing is
// credited to the customer yet. When the bank clears it an admin marks it Cleared and says
// where the money landed (one of the bank accounts, or Cash) — that is when the customer's
// ledger is credited. A cheque that bounces is marked Returned.
async function createChequeRecovery({ companyId, salesmanId, customerId, amount, chequeBank, chequeNumber, chequeDate, notes, photoUrl, createdBy, recoveryDate, notifyAdminsFrom }) {
  const bank = String(chequeBank || '').trim().slice(0, 100);
  const number = String(chequeNumber || '').trim().slice(0, 50);
  const date = String(chequeDate || '').trim();
  if (!customerId || !salesmanId) throw Object.assign(new Error('customer and salesman are required'), { status: 400 });
  if (!(Number(amount) > 0)) throw Object.assign(new Error('Cheque amount is required'), { status: 400 });
  if (!bank) throw Object.assign(new Error('Bank name is required'), { status: 400 });
  if (!number) throw Object.assign(new Error('Cheque number is required'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('Cheque date is required'), { status: 400 });

  const row = {
    company_id: companyId, salesman_id: salesmanId, customer_id: customerId,
    amount: Number(amount),
    payment_type: 'cheque', payment_method: 'cheque',
    reference_number: number,
    notes: notes || null,
    status: 'pending', approved_by: null, approved_at: null,
    recovery_date: recoveryDate || new Date().toISOString().split('T')[0],
    created_by: createdBy || null,
    cheque_number: number, cheque_bank: bank, cheque_date: date, cheque_status: 'pending',
  };
  let recovery;
  try {
    [recovery] = await pgrestPost('salesman_recoveries', { ...row, photo_url: photoUrl || null });
  } catch (e) {
    try {
      [recovery] = await pgrestPost('salesman_recoveries', row);
    } catch (e2) {
      throw Object.assign(new Error('Could not save the cheque — run sql/phase72_cheque_payments.sql in Supabase first. (' + e2.message + ')'), { status: 400 });
    }
  }

  paymentMessages.paymentPending({ customerId, amount });

  try {
    const custRows = await pgrestGet('users', { select: 'full_name,shop_name', id: `eq.${customerId}` }).catch(() => []);
    const custName = custRows?.[0]?.shop_name || custRows?.[0]?.full_name || '';
    await pgrestPost('notifications', {
      company_id: companyId, recipient_role: 'branch_admin',
      title: 'Cheque received',
      body: `${notifyAdminsFrom || 'A salesman'} recorded a PKR ${Number(amount).toLocaleString()} cheque (${bank} #${number}, dated ${date})${custName ? ` from ${custName}` : ''} — mark it Cleared in Salesman Recovery → Cheques once the bank passes it.`,
      type: 'payment', reference_id: recovery?.id || null,
    });
  } catch (e) { /* non-fatal */ }
  return recovery;
}

const chequeErr = (res, e) => error(res, e.message, e.status || 500);

// GET /api/v1/recovery/cheques?status=pending|cleared|returned&salesman_id=
router.get('/cheques', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { status, salesman_id } = req.query;
    const params = {
      select: (await withPhoto(RECOVERY_SELECT)),
      payment_type: 'eq.cheque',
      status: 'neq.deleted',
      order: 'cheque_date.asc,created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (salesman_id) params.salesman_id = `eq.${salesman_id}`;
    if (['pending', 'cleared', 'returned'].includes(status)) params.cheque_status = `eq.${status}`;
    try {
      return success(res, await pgrestGet('salesman_recoveries', params));
    } catch (e) {
      return success(res, []); // phase72 not run yet — no cheques can exist
    }
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/cheques/:id/clear { destination: 'bank' | 'cash', bank_account_id }
router.patch('/cheques/:id/clear', authenticate, isAdmin, async (req, res) => {
  try {
    // destination: 'bank' + bank_account_id, or 'cash' (= the branch's 'Cash in Hand' account, whose
    // bank_name is 'Cash' in the Bank panel — picking that account counts as cash too)
    const { destination } = req.body || {};
    let bank_account_id = req.body?.bank_account_id || null;
    if (!['bank', 'cash'].includes(destination)) return error(res, 'Choose where the money was deposited: a bank account or Cash', 400);
    if (destination === 'bank' && !bank_account_id) return error(res, 'Select the bank account the cheque was deposited into', 400);

    const rows = await pgrestGet('salesman_recoveries', { select: '*', payment_type: 'eq.cheque', ...scopeFilter(req) });
    const cheque = rows?.[0];
    if (!cheque) return error(res, 'Cheque not found or access denied', 404);
    if (cheque.status === 'deleted' || cheque.cheque_status !== 'pending') return error(res, `This cheque is already ${cheque.status === 'deleted' ? 'deleted' : cheque.cheque_status}.`, 400);

    let bankLabel = 'Cash';
    let clearedTo = destination;
    if (destination === 'cash' && !bank_account_id) {
      const cashAcc = await pgrestGet('bank_accounts', { select: 'id', company_id: `eq.${cheque.company_id}`, bank_name: 'ilike.cash', is_active: 'eq.true', limit: '1' }).catch(() => []);
      bank_account_id = cashAcc?.[0]?.id || null; // no cash-book account set up: still recorded as cash
    }
    if (bank_account_id) {
      const banks = await pgrestGet('bank_accounts', { select: 'id,account_name,bank_name,company_id', id: `eq.${bank_account_id}` });
      const b = banks?.[0];
      if (!b || b.company_id !== cheque.company_id) return error(res, 'Bank account not found for this branch', 400);
      if (String(b.bank_name).trim().toLowerCase() === 'cash') { clearedTo = 'cash'; bankLabel = 'Cash'; }
      else { clearedTo = 'bank'; bankLabel = String(b.bank_name) === String(b.account_name) ? b.bank_name : `${b.bank_name} — ${b.account_name}`; }
    }

    const alreadyCredited = cheque.status === 'approved';
    // only one request can flip pending → cleared (a double click must not credit twice)
    const updated = await pgrestPatch('salesman_recoveries', { id: `eq.${cheque.id}`, cheque_status: 'eq.pending' }, {
      status: 'approved', approved_by: req.user.id, approved_at: new Date().toISOString(),
      cheque_status: 'cleared', cleared_at: new Date().toISOString(),
      cleared_to: clearedTo, cleared_bank_account_id: bank_account_id,
    });
    if (!updated?.[0]) return error(res, 'This cheque was just updated by someone else — refresh the list.', 409);

    // A cheque moved over from the old Payments page was already credited to the customer when
    // it was received (status 'approved' while still pending at the bank) — clearing it then only
    // records where it was deposited; crediting again would count it twice.
    if (!alreadyCredited) {
      await creditLedger({
        companyId: cheque.company_id, customerId: cheque.customer_id, amount: Number(cheque.amount),
        description: `Cheque #${cheque.cheque_number} (${cheque.cheque_bank}) cleared — deposited to ${bankLabel}`,
        userId: req.user.id,
      });
      paymentMessages.paymentReceived({ customerId: cheque.customer_id, amount: cheque.amount, method: 'cheque' });
    }
    await notifyUser({
      companyId: cheque.company_id, recipientId: cheque.salesman_id,
      title: 'Cheque cleared',
      body: `Your PKR ${Number(cheque.amount).toLocaleString()} cheque (#${cheque.cheque_number}) has cleared and was deposited to ${bankLabel}.`,
      type: 'payment', referenceId: cheque.id,
    });
    return success(res, { cleared: true, deposited_to: bankLabel }, alreadyCredited ? `Cheque cleared — ${bankLabel} (customer was already credited when it was received)` : `Cheque cleared — ${bankLabel}; customer balance updated`);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/cheques/:id/reject { reason } — the entry is not valid (wrong, never received,
// duplicate...). Different from Return (the bank bounced a real cheque). A reason is required.
// A cheque moved over from the old Payments page was already credited, so that credit is reversed.
router.patch('/cheques/:id/reject', authenticate, isAdmin, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim().slice(0, 200);
    if (reason.length < 3) return error(res, 'A reason is required to reject this cheque (at least 3 characters).', 400);
    const rows = await pgrestGet('salesman_recoveries', { select: '*', payment_type: 'eq.cheque', ...scopeFilter(req) });
    const cheque = rows?.[0];
    if (!cheque) return error(res, 'Cheque not found or access denied', 404);
    if (cheque.status === 'deleted' || cheque.cheque_status !== 'pending') return error(res, 'Only a pending cheque can be rejected.', 400);

    const wasCredited = cheque.status === 'approved';
    const patch = { status: 'rejected', approved_by: req.user.id, approved_at: new Date().toISOString(), cheque_status: 'rejected' };
    const updated = await pgrestPatch('salesman_recoveries', { id: `eq.${cheque.id}`, cheque_status: 'eq.pending' }, {
      ...patch, removed_reason: reason, removed_by: req.user.id, removed_at: new Date().toISOString(),
    }).catch(() => pgrestPatch('salesman_recoveries', { id: `eq.${cheque.id}`, cheque_status: 'eq.pending' }, { ...patch, return_reason: reason }));
    if (!updated?.[0]) return error(res, 'This cheque was just updated by someone else — refresh the list.', 409);

    if (wasCredited) {
      await debitLedger({
        companyId: cheque.company_id, customerId: cheque.customer_id, amount: Number(cheque.amount),
        description: `Cheque #${cheque.cheque_number || '—'} (${cheque.cheque_bank}) rejected by ${req.user.full_name || 'admin'} — reason: ${reason} — balance restored`,
        userId: req.user.id,
      });
    }
    await notifyUser({
      companyId: cheque.company_id, recipientId: cheque.salesman_id,
      title: 'Cheque rejected',
      body: `Your PKR ${Number(cheque.amount).toLocaleString()} cheque (${cheque.cheque_bank}${cheque.cheque_number ? ` #${cheque.cheque_number}` : ''}) was rejected by the office. Reason: ${reason}`,
      type: 'payment', referenceId: cheque.id,
    });
    return success(res, { rejected: true, reversed: wasCredited }, wasCredited ? 'Cheque rejected and the customer balance restored' : 'Cheque rejected');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/removed?salesman_id= — rejected and deleted payments (kept for the record)
router.get('/removed', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: await withPhoto(RECOVERY_SELECT), status: 'in.(rejected,deleted)', order: 'created_at.desc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (req.query.salesman_id) params.salesman_id = `eq.${req.query.salesman_id}`;
    return success(res, await pgrestGet('salesman_recoveries', params));
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/cheques/:id/return { reason? } — the cheque bounced / was not passed
router.patch('/cheques/:id/return', authenticate, isAdmin, async (req, res) => {
  try {
    const rows = await pgrestGet('salesman_recoveries', { select: '*', payment_type: 'eq.cheque', ...scopeFilter(req) });
    const cheque = rows?.[0];
    if (!cheque) return error(res, 'Cheque not found or access denied', 404);
    if (cheque.status === 'deleted' || cheque.cheque_status !== 'pending') return error(res, `This cheque is already ${cheque.status === 'deleted' ? 'deleted' : cheque.cheque_status}.`, 400);
    const reason = String(req.body?.reason || '').trim().slice(0, 200);

    const updated = await pgrestPatch('salesman_recoveries', { id: `eq.${cheque.id}`, cheque_status: 'eq.pending' }, {
      status: 'rejected', approved_by: req.user.id, approved_at: new Date().toISOString(),
      cheque_status: 'returned', returned_at: new Date().toISOString(), return_reason: reason || null,
    });
    if (!updated?.[0]) return error(res, 'This cheque was just updated by someone else — refresh the list.', 409);

    await notifyUser({
      companyId: cheque.company_id, recipientId: cheque.salesman_id,
      title: 'Cheque returned',
      body: `The PKR ${Number(cheque.amount).toLocaleString()} cheque (#${cheque.cheque_number}, ${cheque.cheque_bank}) was returned by the bank${reason ? `. ${reason}` : ''}. The customer's balance was not reduced.`,
      type: 'payment', referenceId: cheque.id,
    });
    return success(res, { returned: true }, 'Cheque marked as returned');
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

    paymentMessages.paymentReceived({ customerId: customer_id, amount, method: 'cash' });

    return success(res, recovery, 'Cash collection recorded', 201);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/recovery/cheque/me — a customer paid the salesman by cheque (Record Payment's
// "Cheque" option). Pending until the bank clears it — see createChequeRecovery above.
router.post('/cheque/me', authenticate, isSalesman, async (req, res) => {
  try {
    const { customer_id, amount, cheque_bank, cheque_number, cheque_date, notes, photo_url } = req.body;
    const recovery = await createChequeRecovery({
      companyId: req.user.company_id, salesmanId: req.user.id, customerId: customer_id, amount,
      chequeBank: cheque_bank, chequeNumber: cheque_number, chequeDate: cheque_date,
      notes, photoUrl: photo_url, createdBy: null, notifyAdminsFrom: req.user.full_name,
    });
    return success(res, recovery, 'Cheque recorded — pending until it clears', 201);
  } catch (err) { return chequeErr(res, err); }
});

// POST /api/v1/recovery/bank-transfer/me — a customer paying a salesman
// directly via bank transfer (Record Payment's "Bank Transfer" option).
// It is NOT auto-approved: it sits as 'pending' in the dashboard's Pending
// Approvals until an admin checks the transfer and approves it — only then
// is the customer's ledger credited (see PATCH /transactions/:id/approve).
// The customer gets a WhatsApp "pending" message now and a "received" one
// (with their outstanding balance) on approval. It uses payment_type
// 'bank' (not 'cash'), which my-cash-in-hand's `payment_type: eq.cash`
// filter already excludes, so it never counts as cash the salesman holds.
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
      notes:            [notes, bank_account_label ? `Bank: ${bank_account_label}` : null].filter(Boolean).join(' · ') || null,
      status:           'pending',
      approved_by:      null,
      approved_at:      null,
      recovery_date:    new Date().toISOString().split('T')[0],
      created_by:       null,
    };
    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', { ...recoveryRow, photo_url: photo_url || null });
    } catch (e) {
      [recovery] = await pgrestPost('salesman_recoveries', recoveryRow);
    }

    paymentMessages.paymentPending({ customerId: customer_id, amount });

    // Best-effort heads-up for the admins who approve it.
    try {
      const custRows = await pgrestGet('users', { select: 'full_name,shop_name', id: `eq.${customer_id}` }).catch(() => []);
      const custName = custRows?.[0]?.shop_name || custRows?.[0]?.full_name || '';
      await pgrestPost('notifications', {
        company_id:     req.user.company_id,
        recipient_role: 'branch_admin',
        title:          'Bank transfer awaiting approval',
        body:           `${req.user.full_name || 'A salesman'} recorded a PKR ${Number(amount).toLocaleString()} bank transfer${custName ? ` from ${custName}` : ''} — approve it in Salesman Recovery → Pending Approvals.`,
        type:           'payment',
        reference_id:   recovery?.id || null,
      });
    } catch (e) { /* non-fatal */ }

    return success(res, recovery, 'Bank transfer submitted — pending admin approval', 201);
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
      status: 'neq.deleted',
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
      status: 'neq.deleted',
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
      status: 'neq.deleted',
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
// vendor_id column (phase74) — same lazy-check as photo_url/cheque.
let vendorColumnKnown = null;
async function hasVendorColumn() {
  if (vendorColumnKnown !== null) return vendorColumnKnown;
  try {
    await pgrestGet('salesman_recoveries', { select: 'vendor_id', limit: '1' });
    vendorColumnKnown = true;
  } catch (_) { return false; }
  return vendorColumnKnown;
}

// POST /api/v1/recovery/vendor-transfer/me — salesman version.
// Same FK caveat as /transactions/me: approved_by and created_by must stay
// null because they FK to users(id) and a salesman's id is in salesmen, not users.
router.post('/vendor-transfer/me', authenticate, isSalesman, async (req, res) => {
  try {
    const { customer_id, supplier_id, amount, recovery_date, reference_number, notes } = req.body;
    if (!customer_id || !supplier_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id, supplier_id and a positive amount are required', 400);

    const rowData = {
      company_id:       req.user.company_id,
      salesman_id:      req.user.id,
      customer_id,
      amount:           Number(amount),
      payment_type:     'vendor_transfer',
      payment_method:   'vendor_transfer',
      reference_number: reference_number || null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       null,
    };
    if (await hasVendorColumn()) rowData.vendor_id = supplier_id;

    const [recovery] = await pgrestPost('salesman_recoveries', rowData);

    await creditLedger({
      companyId:   req.user.company_id,
      customerId:  customer_id,
      amount:      Number(amount),
      description: 'Direct vendor transfer — customer balance settled via supplier',
      userId:      null,
    });

    return success(res, recovery, 'Direct vendor transfer recorded', 201);
  } catch (err) { return error(res, err.message, err.status || 500); }
});

// POST /api/v1/recovery/vendor-transfer — direct customer-to-vendor transfer.
// Auto-approved: credits customer ledger immediately. Does NOT touch company
// cash or bank balances. The vendor_id records which supplier payable was cleared.
router.post('/vendor-transfer', authenticate, isAdmin, async (req, res) => {
  try {
    const { customer_id, supplier_id, amount, salesman_id, recovery_date, reference_number, notes } = req.body;
    if (!customer_id || !supplier_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id, supplier_id and a positive amount are required', 400);

    const companyId = req.user.company_id;
    const rowData = {
      company_id:       companyId,
      customer_id,
      salesman_id:      salesman_id || null,
      amount:           Number(amount),
      payment_type:     'vendor_transfer',
      payment_method:   'vendor_transfer',
      reference_number: reference_number || null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      req.user.id,
      approved_at:      new Date().toISOString(),
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       req.user.id,
    };
    if (await hasVendorColumn()) rowData.vendor_id = supplier_id;

    const [recovery] = await pgrestPost('salesman_recoveries', rowData);

    await creditLedger({
      companyId,
      customerId:  customer_id,
      amount:      Number(amount),
      description: 'Direct vendor transfer — customer balance settled via supplier',
      userId:      req.user.id,
    });

    return success(res, recovery, 'Direct vendor transfer recorded', 201);
  } catch (err) { return error(res, err.message, err.status || 500); }
});

// GET /api/v1/recovery/vendor-transfers — vendor-transfer entries with
// customer + supplier names; used by the Payments page "Direct Transfers" tab.
router.get('/vendor-transfers', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const baseSelect = 'id,company_id,salesman_id,customer_id,amount,reference_number,notes,recovery_date,created_at,salesmen(id,full_name),users!customer_id(id,full_name,phone,shop_name)';
    const params = {
      select: baseSelect,
      payment_type: 'eq.vendor_transfer',
      order: 'created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    let data;
    if (await hasVendorColumn()) {
      try {
        data = await pgrestGet('salesman_recoveries', {
          ...params,
          select: baseSelect + ',suppliers!vendor_id(id,name)',
        });
      } catch (_) {
        data = await pgrestGet('salesman_recoveries', params);
      }
    } else {
      data = await pgrestGet('salesman_recoveries', params);
    }

    return success(res, data || []);
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
