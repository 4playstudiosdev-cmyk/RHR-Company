const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isSalesman, isDriver } = require('../middleware/role.middleware');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { recalcCustomerLedger, recalcSupplierLedger } = require('../services/orderLedger.service');
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
// POST /ledger/adjustment and the order-return flow.
async function creditLedger({ companyId, customerId, amount, description, userId, date, referenceId }) {
  // When inserting a backdated entry (date < now), look for the most recent
  // existing entry that is <= the target date so the stored snapshot is
  // correct even if later entries already exist.
  const targetDate = date ? new Date(date).toISOString() : new Date().toISOString();
  const lastEntries = await pgrestGet('ledger_entries', {
    select: 'running_balance',
    customer_id: `eq.${customerId}`,
    created_at: `lte.${targetDate}`,
    order: 'created_at.desc',
    limit: '1',
  });
  const prevBalance = lastEntries?.[0]?.running_balance || 0;
  const newBalance = prevBalance - Number(amount);

  const entryRow = {
    company_id: companyId,
    customer_id: customerId,
    entry_type: 'credit',
    amount: Number(amount),
    running_balance: newBalance,
    description,
    reference_type: 'recovery',
    ...(referenceId ? { reference_id: referenceId } : {}),
    created_by: userId,
  };
  if (date) entryRow.created_at = new Date(date).toISOString();
  await pgrestPost('ledger_entries', entryRow);
  if (date) await recalcCustomerLedger(customerId);
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

    let selectStr = await withPhoto(RECOVERY_SELECT);
    if (await hasVendorColumn()) {
      try { selectStr += ',suppliers!vendor_id(id,name)'; } catch (_) {}
    }
    const params = { select: selectStr, order: 'recovery_date.desc,created_at.desc' };
    if (companyId)   params.company_id  = `eq.${companyId}`;
    if (salesman_id) params.salesman_id = `eq.${salesman_id}`;
    params.status = status ? `eq.${status}` : 'neq.deleted';

    let data;
    try {
      data = await pgrestGet('salesman_recoveries', params);
    } catch (_) {
      // fallback without suppliers join if FK not set up
      params.select = await withPhoto(RECOVERY_SELECT);
      data = await pgrestGet('salesman_recoveries', params);
    }
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
      reference_number, notes, recovery_date,
      photo_url, bank_account_id, bank_account_label,
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

    // Bank transfer requires a bank account to be linked
    if (payment_type === 'online' && payment_method === 'bank_transfer' && !bank_account_id)
      return error(res, 'bank_account_id is required for bank_transfer payments', 400);

    // For bank_transfer, encode bank_account_id in reference_number and label in notes
    const isBankTransfer = payment_method === 'bank_transfer';
    const effectiveRef = isBankTransfer && bank_account_id ? bank_account_id : (reference_number || null);
    const effectiveNotes = [notes, isBankTransfer && bank_account_label ? `Bank: ${bank_account_label}` : null].filter(Boolean).join(' · ') || null;

    const baseRow = {
      company_id:       companyId,
      salesman_id,
      customer_id,
      amount:           Number(amount),
      payment_type,
      payment_method:   payment_method || payment_type,
      reference_number: effectiveRef,
      notes:            effectiveNotes,
      status:           isCash ? 'approved' : 'pending',
      approved_by:      isCash ? req.user.id : null,
      approved_at:      isCash ? new Date().toISOString() : null,
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
      created_by:       req.user.id,
    };
    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', { ...baseRow, photo_url: photo_url || null });
    } catch (e) {
      [recovery] = await pgrestPost('salesman_recoveries', baseRow);
    }

    if (isCash) {
      await creditLedger({
        companyId,
        customerId: customer_id,
        amount: Number(amount),
        description: 'Cash payment received by salesman',
        userId: req.user.id,
        date: recovery_date,
        referenceId: recovery.id,
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

    if (recovery.payment_type === 'vendor_transfer') {
      // Deferred ledger + expense writes for salesman vendor transfers
      const supplierId = recovery.vendor_id || null;
      const expenseDate = recovery.recovery_date || new Date().toISOString().split('T')[0];
      const rawMethod = recovery.payment_method; // 'vendor_transfer' or 'bank_transfer'

      let supplierNameForLedger = 'vendor';
      try {
        if (supplierId) {
          const sRows = await pgrestGet('suppliers', { select: 'name', id: `eq.${supplierId}` });
          supplierNameForLedger = sRows?.[0]?.name || 'vendor';
        }
      } catch (_) {}

      await creditLedger({
        companyId:   recovery.company_id,
        customerId:  recovery.customer_id,
        amount:      Number(recovery.amount),
        description: `Vendor transfer to ${supplierNameForLedger} — customer balance settled`,
        userId:      req.user.id,
        date:        recovery.recovery_date,
        referenceId: recovery.id,
      });

      if (supplierId) {
        let supplierName = 'vendor';
        try {
          const suppliers = await pgrestGet('suppliers', { select: 'name', id: `eq.${supplierId}` });
          supplierName = suppliers?.[0]?.name || 'vendor';
        } catch (_) {}

        const expMethod = (rawMethod === 'bank_transfer' || rawMethod === 'cheque') ? 'bank' : 'cash';
        const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
        let bankAcctId = recovery.bank_account_id
          || (rawMethod === 'bank_transfer' || rawMethod === 'cheque' ? recovery.reference_number : null)
          || null;
        // A cheque / bank vendor transfer always goes through the branch's Direct
        // Transfer account (IN then OUT there) — also when another bank, or a typed
        // reference, was stored in its place.
        if (rawMethod === 'bank_transfer' || rawMethod === 'cheque') {
          try {
            const accts = await pgrestGet('bank_accounts', { select: 'id,account_name,bank_name', company_id: `eq.${recovery.company_id}`, is_active: 'eq.true' });
            const dt = (accts || []).find((a) => `${a.account_name || ''} ${a.bank_name || ''}`.toLowerCase().includes('direct transfer'));
            if (dt) bankAcctId = dt.id;
            else if (!isUuid(bankAcctId)) bankAcctId = null;
            if (dt && recovery.reference_number !== dt.id) await pgrestPatch('salesman_recoveries', { id: `eq.${recovery.id}` }, { reference_number: dt.id }).catch(() => {});
          } catch (_) { if (!isUuid(bankAcctId)) bankAcctId = null; }
        }

        // Fetch bank name for description
        let bankNameLabel = '';
        if (bankAcctId && (rawMethod === 'bank_transfer' || rawMethod === 'cheque')) {
          try {
            const bankRow = await pgrestGet('bank_accounts', { select: 'bank_name', id: `eq.${bankAcctId}`, limit: '1' });
            bankNameLabel = bankRow?.[0]?.bank_name || '';
          } catch (_) {}
        }
        // same wording as an admin-recorded vendor transfer: "Cheque#123 (HBL) via Direct Transfer"
        const chequeText = `Cheque#${recovery.cheque_number || ''}${recovery.cheque_bank ? ` (${recovery.cheque_bank})` : ''}`;
        const how = rawMethod === 'cheque' ? chequeText : rawMethod === 'bank_transfer' ? 'bank transfer' : 'cash';
        const methodLabel = rawMethod === 'bank_transfer'
          ? `bank transfer${bankNameLabel ? ` — ${bankNameLabel}` : ''}`
          : rawMethod === 'cheque'
            ? `${chequeText.replace(/^Cheque/, 'cheque ')}${bankNameLabel ? ` — ${bankNameLabel}` : ''}`
            : 'cash';

        const expenseBase = {
          company_id:   recovery.company_id,
          category:     'Vendor Payment',
          amount:       Number(recovery.amount),
          description:  `Vendor payment to ${supplierName} — ${how}${bankNameLabel ? ` via ${bankNameLabel}` : ''}`,
          expense_date: expenseDate,
          method:       expMethod,
          ...(bankAcctId && (rawMethod === 'bank_transfer' || rawMethod === 'cheque') ? { bank_account_id: bankAcctId } : {}),
        };
        try {
          await pgrestPost('expenses', { ...expenseBase, salesman_id: recovery.salesman_id, supplier_id: supplierId });
        } catch (_) {
          try { await pgrestPost('expenses', { ...expenseBase, supplier_id: supplierId }); } catch (_2) {
            try { await pgrestPost('expenses', expenseBase); } catch (_3) { /* non-fatal */ }
          }
        }

        try {
          const last = await pgrestGet('supplier_ledger_entries', {
            select: 'running_balance', supplier_id: `eq.${supplierId}`,
            order: 'created_at.desc', limit: '1',
          });
          const prevBal = Number(last?.[0]?.running_balance) || 0;
          const ledgerRow = {
            supplier_id:     supplierId,
            entry_type:      'credit',
            amount:          Number(recovery.amount),
            running_balance: prevBal - Number(recovery.amount),
            description:     `Salesman vendor transfer approved — via ${methodLabel}`,
            reference_type:  'vendor_transfer',
            created_by:      req.user.id,
            created_at:      new Date(expenseDate).toISOString(),
          };
          try {
            await pgrestPost('supplier_ledger_entries', { ...ledgerRow, company_id: recovery.company_id });
          } catch (_) { await pgrestPost('supplier_ledger_entries', ledgerRow); }
        } catch (_) { /* non-fatal */ }
      }

      await notifyUser({
        companyId:   recovery.company_id,
        recipientId: recovery.salesman_id,
        title:       'Vendor Transfer Approved',
        body:        `Your PKR ${Number(recovery.amount).toLocaleString()} vendor transfer has been approved`,
        type:        'payment',
        referenceId: recovery.id,
      });

      return success(res, { approved: true }, 'Vendor transfer approved — ledger and expense updated');
    }

    await creditLedger({
      companyId: recovery.company_id,
      customerId: recovery.customer_id,
      amount: Number(recovery.amount),
      description: recovery.payment_method === 'bank_transfer' ? 'Bank transfer approved' : `Online payment approved — ${recovery.payment_method}`,
      userId: req.user.id,
      date: recovery.recovery_date,
      referenceId: recovery.id,
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

// Approved cash collected minus approved deposits, plus deposits still waiting for approval.
// ownerKey: 'salesman_id' | 'driver_id'.
async function cashPosition(ownerKey, ownerId) {
  const [collected, closings] = await Promise.all([
    pgrestGet('salesman_recoveries', { select: 'amount', [ownerKey]: `eq.${ownerId}`, payment_type: 'eq.cash', status: 'eq.approved' }),
    pgrestGet('salesman_cash_closings', { select: 'amount,status', [ownerKey]: `eq.${ownerId}`, status: 'in.(approved,pending)' }),
  ]);
  const sum = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount), 0);
  return {
    cashInHand: sum(collected) - sum((closings || []).filter((c) => c.status === 'approved')),
    pendingTotal: sum((closings || []).filter((c) => c.status === 'pending')),
  };
}

// POST /api/v1/recovery/cash-closing — salesman/admin submits an
// end-of-day deposit of cash held; sits pending until an admin approves it.
router.post('/cash-closing', authenticate, isAdmin, async (req, res) => {
  try {
    const { salesman_id, amount, deposit_to, bank_account, notes, closing_date } = req.body;
    if (!salesman_id || !amount || Number(amount) <= 0)
      return error(res, 'salesman_id and a positive amount are required', 400);

    // A deposit can never be more than the cash the salesman actually holds — counting
    // deposits already waiting for approval, so two entries can't add up past it.
    const { cashInHand, pendingTotal } = await cashPosition('salesman_id', salesman_id);
    const available = cashInHand - pendingTotal;
    if (Number(amount) > available + 0.5) {
      return error(res, `Amount PKR ${Number(amount).toLocaleString()} is more than this salesman's cash in hand. Available to deposit: PKR ${Math.max(0, Math.round(available)).toLocaleString()}${pendingTotal > 0 ? ` (PKR ${Math.round(pendingTotal).toLocaleString()} already waiting for approval)` : ''}.`, 400);
    }

    // Book it under the salesman's own branch — a super_admin's company would put a Sukkur
    // deposit into Karachi's books and out of Sukkur's Daily Report.
    let ownerCompanyId = null;
    try {
      const s = await pgrestGet('salesmen', { select: 'company_id', id: `eq.${salesman_id}` });
      ownerCompanyId = s?.[0]?.company_id || null;
    } catch (_) {}

    const [data] = await pgrestPost('salesman_cash_closings', {
      company_id:   ownerCompanyId || req.user.company_id,
      salesman_id,
      amount:       Number(amount),
      deposit_to:   deposit_to === 'petty_cash' ? 'petty_cash' : 'bank',
      bank_account: bank_account || null,
      notes:        notes || null,
      status:       'pending',
      closing_date: closing_date || new Date().toISOString().split('T')[0],
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
      select: isPayment ? 'id,status,company_id,salesman_id,customer_id,vendor_id,amount,payment_type,payment_method,recovery_date,notes,users!customer_id(full_name,shop_name)' : 'id,status',
      ...scopeFilter(req),
    });
    const row = rows?.[0];
    if (!row) return error(res, `${label} not found or access denied`, 404);
    if (row.status === 'deleted') return error(res, `This ${label.toLowerCase()} was already deleted.`, 400);

    if (row.status === 'approved') {
      if (!isPayment) return error(res, `An approved ${label.toLowerCase()} can't be deleted — it has already been counted in the books.`, 400);
      const who = row.users?.shop_name || row.users?.full_name || 'customer';

      // Cascade-delete supplier ledger entry + expense for vendor transfers
      if (row.payment_type === 'vendor_transfer') {
        const expDate = (row.recovery_date || '').split('T')[0];
        try {
          // Delete supplier ledger entry — match by vendor_id + amount + date prefix
          const { pgrestGetRaw: pgRaw } = require('../utils/directQuery');
          const suppId = row.vendor_id || null;
          let suppEntries = null;
          if (suppId) {
            // Prefer exact match by supplier_id + amount + date
            suppEntries = await pgRaw(
              `supplier_ledger_entries?select=id,supplier_id&supplier_id=eq.${suppId}&amount=eq.${Number(row.amount)}&created_at=gte.${expDate}T00:00:00.000Z&created_at=lte.${expDate}T23:59:59.999Z&limit=1`
            ).catch(() => null);
          }
          if (!suppEntries?.[0]) {
            // Fallback: match by reference_type + amount + date
            suppEntries = await pgRaw(
              `supplier_ledger_entries?select=id,supplier_id&reference_type=eq.vendor_transfer&amount=eq.${Number(row.amount)}&created_at=gte.${expDate}T00:00:00.000Z&created_at=lte.${expDate}T23:59:59.999Z&limit=1`
            ).catch(() => null);
          }
          if (suppEntries?.[0]) {
            const foundSuppId = suppEntries[0].supplier_id;
            await pgrestDelete('supplier_ledger_entries', { id: `eq.${suppEntries[0].id}` });
            const { recalcSupplierLedger } = require('../services/orderLedger.service');
            try { await recalcSupplierLedger(foundSuppId); } catch (_) {}
          }
        } catch (_) {}
        try {
          // Delete linked expense (match by company + amount + date + category)
          const expRows = await pgrestGet('expenses', {
            select: 'id',
            company_id: `eq.${row.company_id}`,
            category: 'eq.Vendor Payment',
            amount: `eq.${Number(row.amount)}`,
            expense_date: `eq.${expDate}`,
            order: 'created_at.desc',
            limit: '1',
          });
          if (expRows?.[0]) await pgrestDelete('expenses', { id: `eq.${expRows[0].id}` });
        } catch (_) {}
      }

      // Hard-delete the original credit entry so no reversal line appears in the ledger
      if (row.customer_id) {
        // Try by reference_id first (set on new entries), then fall back to amount+date match
        let entryId = null;
        const byRef = await pgrestGet('ledger_entries', {
          select: 'id',
          customer_id: `eq.${row.customer_id}`,
          reference_type: `eq.recovery`,
          reference_id: `eq.${row.id}`,
          limit: '1',
        });
        if (byRef?.length) {
          entryId = byRef[0].id;
        } else if (row.recovery_date) {
          const byDate = await pgrestGet('ledger_entries', {
            select: 'id',
            customer_id: `eq.${row.customer_id}`,
            reference_type: `eq.recovery`,
            entry_type: `eq.credit`,
            amount: `eq.${Number(row.amount)}`,
            created_at: `gte.${row.recovery_date}T00:00:00.000Z`,
            order: 'created_at.desc',
            limit: '1',
          });
          if (byDate?.length) entryId = byDate[0].id;
        }
        if (entryId) await pgrestDelete('ledger_entries', { id: `eq.${entryId}` });
        await recalcCustomerLedger(row.customer_id);
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

    const found = await pgrestGet('salesman_cash_closings', { select: 'id,amount,status,salesman_id,driver_id', ...filter });
    const closing = found?.[0];
    if (!closing) return error(res, 'Cash closing not found or access denied', 404);
    if (closing.status !== 'pending') return error(res, `This deposit is already ${closing.status}.`, 400);

    // Re-checked at approval: cash in hand may have dropped since it was submitted.
    const ownerKey = closing.salesman_id ? 'salesman_id' : 'driver_id';
    const { cashInHand } = await cashPosition(ownerKey, closing[ownerKey]);
    if (Number(closing.amount) > cashInHand + 0.5) {
      return error(res, `Can't approve: this deposit is PKR ${Number(closing.amount).toLocaleString()} but the cash in hand is only PKR ${Math.max(0, Math.round(cashInHand)).toLocaleString()}. Reject it and enter the correct amount.`, 400);
    }

    filter.status = 'eq.pending';
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

// GET /api/v1/recovery/cash-summary?company_id=
// Per-salesman cash collection vs deposit summary for the Cash Closing panel.
// Returns per-salesman breakdown (collected, closed, in-hand) + recent closings list.
router.get('/cash-summary', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const cfObj = companyId ? { company_id: `eq.${companyId}` } : {};

    const [salesmen, recoveries, closings] = await Promise.all([
      pgrestGet('salesmen', { select: 'id,full_name', ...cfObj, is_active: 'eq.true', order: 'full_name.asc' }),
      pgrestGet('salesman_recoveries', {
        select: 'salesman_id,amount,payment_type,status,recovery_date',
        payment_type: 'eq.cash',
        status: 'eq.approved',
        ...cfObj,
      }),
      pgrestGet('salesman_cash_closings', {
        select: 'id,salesman_id,amount,status,deposit_to,bank_account,notes,closing_date,created_at',
        ...cfObj,
        order: 'created_at.desc',
      }),
    ]);

    // Optional date range (?from=&to=, YYYY-MM-DD). Collected / deposited /
    // pending and the history cover only that range; cash in hand is the
    // balance at the END of the range (everything collected minus everything
    // deposited up to `to`), i.e. what the salesman still held that day.
    const { from, to } = req.query;
    const dayOf = (v) => String(v || '').slice(0, 10);
    const inRange = (d) => (!from || dayOf(d) >= from) && (!to || dayOf(d) <= to);
    const upToEnd = (d) => !to || dayOf(d) <= to;
    const closingDay = (c) => c.closing_date || c.created_at;

    const perSalesman = (salesmen || []).map(s => {
      const sRec = (recoveries || []).filter(r => r.salesman_id === s.id);
      const sClo = (closings || []).filter(c => c.salesman_id === s.id);
      const sum = (rows) => rows.reduce((t, r) => t + Number(r.amount || 0), 0);
      const totalCollected = sum(sRec.filter(r => inRange(r.recovery_date)));
      const totalClosed = sum(sClo.filter(c => c.status === 'approved' && inRange(closingDay(c))));
      const pendingClosed = sum(sClo.filter(c => c.status === 'pending' && inRange(closingDay(c))));
      const cashInHand = sum(sRec.filter(r => upToEnd(r.recovery_date)))
        - sum(sClo.filter(c => c.status === 'approved' && upToEnd(closingDay(c))));
      return {
        id: s.id,
        name: s.full_name,
        total_collected: totalCollected,
        total_deposited: totalClosed,
        pending_deposit: pendingClosed,
        cash_in_hand: cashInHand,
      };
    }).filter(s => s.total_collected > 0 || s.total_deposited > 0 || s.pending_deposit > 0 || s.cash_in_hand !== 0);

    const salesmanMap = Object.fromEntries((salesmen || []).map(s => [s.id, s.full_name]));
    const closingsInRange = (from || to) ? (closings || []).filter(c => inRange(closingDay(c))) : (closings || []).slice(0, 100);
    const recentClosings = closingsInRange.map(c => ({
      ...c,
      salesman_name: salesmanMap[c.salesman_id] || 'Unknown',
    }));

    const totals = {
      total_collected: perSalesman.reduce((s, p) => s + p.total_collected, 0),
      total_deposited: perSalesman.reduce((s, p) => s + p.total_deposited, 0),
      pending_deposit: perSalesman.reduce((s, p) => s + p.pending_deposit, 0),
      cash_in_hand: perSalesman.reduce((s, p) => s + p.cash_in_hand, 0),
    };

    return success(res, { per_salesman: perSalesman, recent_closings: recentClosings, totals });
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
        userId: req.user.id, referenceId: cheque.id,
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
      // Hard-delete the original credit entry so no reversal line appears
      const byRef = await pgrestGet('ledger_entries', {
        select: 'id', customer_id: `eq.${cheque.customer_id}`,
        reference_type: 'eq.recovery', reference_id: `eq.${cheque.id}`, limit: '1',
      });
      let entryId = byRef?.[0]?.id;
      if (!entryId) {
        const byAmt = await pgrestGet('ledger_entries', {
          select: 'id', customer_id: `eq.${cheque.customer_id}`,
          reference_type: 'eq.recovery', entry_type: 'eq.credit',
          amount: `eq.${Number(cheque.amount)}`, order: 'created_at.desc', limit: '1',
        });
        entryId = byAmt?.[0]?.id;
      }
      if (entryId) await pgrestDelete('ledger_entries', { id: `eq.${entryId}` });
      await recalcCustomerLedger(cheque.customer_id);
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
    const baseSelect = await withPhoto(RECOVERY_SELECT);
    const params = { select: baseSelect, status: 'in.(rejected,deleted)', order: 'created_at.desc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (req.query.salesman_id) params.salesman_id = `eq.${req.query.salesman_id}`;

    // Vendor name for vendor transfers; falls back to the plain select if the join isn't available.
    let rows;
    try {
      rows = await pgrestGet('salesman_recoveries', {
        ...params,
        select: (await hasVendorColumn()) ? `${baseSelect},suppliers!vendor_id(id,name)` : baseSelect,
      });
    } catch (_) {
      rows = await pgrestGet('salesman_recoveries', params);
    }

    // reference_number holds the chosen bank account's id for bank / vendor transfers —
    // resolve it to a readable bank + account name.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bankIds = [...new Set((rows || []).map((r) => r.reference_number).filter((v) => UUID.test(v || '')))];
    let banks = {};
    if (bankIds.length) {
      try {
        const list = await pgrestGet('bank_accounts', { select: 'id,account_name,bank_name,account_number', id: `in.(${bankIds.join(',')})` });
        banks = Object.fromEntries((list || []).map((b) => [b.id, b]));
      } catch (_) { /* names are a nicety — rows still return */ }
    }
    return success(res, (rows || []).map((r) => ({ ...r, bank_account: banks[r.reference_number] || null })));
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
      date: recovery_date,
      referenceId: recovery.id,
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
    const { customer_id, amount, bank_account_id, bank_account_label, notes, photo_url, recovery_date } = req.body;
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
      recovery_date:    recovery_date || new Date().toISOString().split('T')[0],
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
      // vendor_transfer rows are included so a salesman's rejected/pending vendor transfer
      // also shows in Deposit History (the app reads this list as-is).
      payment_type: 'in.(bank,vendor_transfer)',
      status: 'neq.deleted',
      order: 'recovery_date.desc,created_at.desc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recovery/cheques/me — this salesman's own cheques with their
// status (pending / cleared / rejected / returned) and the office's reason, for
// the app's Cash Collection history. A separate endpoint so older app builds,
// which show /bank-transfers/me as "Bank Transfer …", are not affected.
router.get('/cheques/me', authenticate, isSalesman, async (req, res) => {
  try {
    const data = await pgrestGet('salesman_recoveries', {
      select: await withPhoto(RECOVERY_SELECT),
      salesman_id: `eq.${req.user.id}`,
      payment_type: 'eq.cheque',
      status: 'neq.deleted',
      order: 'recovery_date.desc,created_at.desc',
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
      order: 'recovery_date.desc,created_at.desc',
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
      date: recovery_date,
      referenceId: recovery.id,
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
      order: 'recovery_date.desc,created_at.desc',
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
    const { customer_id, supplier_id, amount, recovery_date, reference_number, notes, vendor_payment_method, cheque_number, cheque_date, cheque_bank, photo_url } = req.body;
    let { bank_account_id } = req.body;
    if (!customer_id || !supplier_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id, supplier_id and a positive amount are required', 400);
    if (vendor_payment_method === 'cheque' && (!cheque_number || !cheque_date))
      return error(res, 'cheque_number and cheque_date are required for cheque vendor payment', 400);
    // Cash → Cash in Hand (IN then OUT on approval). Cheque / bank transfer → always the
    // branch's Direct Transfer account (IN then OUT on approval), whatever was picked.
    if (vendor_payment_method === 'bank_transfer' || vendor_payment_method === 'cheque') {
      const accts = await pgrestGet('bank_accounts', { select: 'id,account_name,bank_name', company_id: `eq.${req.user.company_id}`, is_active: 'eq.true' }).catch(() => []);
      const dt = (accts || []).find((a) => `${a.account_name || ''} ${a.bank_name || ''}`.toLowerCase().includes('direct transfer'));
      if (dt) bank_account_id = dt.id;
      if (!bank_account_id) return error(res, 'No Direct Transfer bank account is set up for your branch — ask the admin.', 400);
    } else {
      bank_account_id = null;
    }

    const expenseDate = recovery_date || new Date().toISOString().split('T')[0];
    // how the customer paid the vendor — shown as the Method everywhere
    const payMethod = vendor_payment_method === 'bank_transfer' ? 'bank_transfer'
      : vendor_payment_method === 'cheque' ? 'cheque'
      : 'cash';

    const rowData = {
      company_id:       req.user.company_id,
      salesman_id:      req.user.id,
      customer_id,
      amount:           Number(amount),
      payment_type:     'vendor_transfer',
      payment_method:   payMethod,
      reference_number: reference_number || null,
      notes:            notes || null,
      status:           'pending',
      approved_by:      null,
      approved_at:      null,
      recovery_date:    expenseDate,
      created_by:       null,
    };
    if (await hasVendorColumn()) rowData.vendor_id = supplier_id;
    if (await hasChequeColumns()) {
      if (cheque_number) rowData.cheque_number = cheque_number;
      if (cheque_bank)   rowData.cheque_bank   = cheque_bank;
      if (cheque_date)   rowData.cheque_date   = cheque_date;
    }
    // reference_number holds the chosen bank account (salesman_recoveries has no
    // bank_account_id column). A typed reference / transaction no. goes into the
    // notes instead — before, typing one (e.g. "00") lost the bank, and on
    // approval the vendor payment never reached the Direct Transfer account.
    if (bank_account_id) {
      rowData.reference_number = bank_account_id;
      if (reference_number) rowData.notes = [notes, `Ref: ${reference_number}`].filter(Boolean).join(' · ');
    }
    // photo_url (phase63) — proof photo uploaded by the app; was being dropped here
    if (photo_url && await hasPhotoColumn()) rowData.photo_url = photo_url;

    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', rowData);
    } catch (e) {
      if (!rowData.photo_url) throw e;
      delete rowData.photo_url;
      [recovery] = await pgrestPost('salesman_recoveries', rowData);
    }

    // Notify all admins for this company — ledger/expense/supplier updates are deferred to approval
    try {
      let supplierName = 'vendor';
      try {
        const suppliers = await pgrestGet('suppliers', { select: 'name', id: `eq.${supplier_id}` });
        supplierName = suppliers?.[0]?.name || 'vendor';
      } catch (_) {}
      const methodLabel = vendor_payment_method === 'bank_transfer' ? 'bank transfer'
        : vendor_payment_method === 'cheque' ? 'cheque'
        : 'cash';
      await pgrestPost('notifications', {
        company_id:     req.user.company_id,
        recipient_role: 'branch_admin',
        title:          'Vendor Transfer — Pending Approval',
        body:           `${req.user.full_name} recorded a PKR ${Number(amount).toLocaleString()} vendor transfer to ${supplierName} via ${methodLabel}${reference_number ? ` (Ref: ${reference_number})` : ''} — approve in Salesman Recovery.`,
        type:           'payment',
        reference_id:   recovery?.id || null,
      });
    } catch (_) { /* non-fatal */ }

    return success(res, recovery, 'Vendor transfer recorded — pending admin approval', 201);
  } catch (err) { return error(res, err.message, err.status || 500); }
});

// POST /api/v1/recovery/vendor-transfer — direct customer-to-vendor transfer.
// Auto-approved: credits customer ledger immediately, creates the Vendor Payment
// expense and credits the supplier ledger. How the customer paid decides the account:
//   cash                   → Cash in Hand (shows IN then OUT there)
//   cheque / bank_transfer → the branch's Direct Transfer account (IN then OUT)
router.post('/vendor-transfer', authenticate, isAdmin, async (req, res) => {
  try {
    const { customer_id, supplier_id, amount, salesman_id, recovery_date, reference_number, notes,
            photo_url, cheque_number, cheque_bank, cheque_date } = req.body;
    let { bank_account_id } = req.body;
    const vendor_payment_method = ['cash', 'cheque', 'bank_transfer'].includes(req.body.vendor_payment_method)
      ? req.body.vendor_payment_method : 'bank_transfer';
    const viaBank = vendor_payment_method === 'bank_transfer' || vendor_payment_method === 'cheque';
    if (!customer_id || !supplier_id || !amount || Number(amount) <= 0)
      return error(res, 'customer_id, supplier_id and a positive amount are required', 400);
    if (vendor_payment_method === 'cheque' && !String(cheque_number || '').trim())
      return error(res, 'Cheque number is required for a cheque vendor transfer', 400);

    // The customer's company decides where the payment is booked (recovery, customer ledger,
    // expense, vendor ledger) — a super_admin's own company_id would otherwise put a Sukkur
    // customer's transfer into Karachi's books. Supplier's company is the fallback.
    let supplierNameEarly = 'vendor';
    let supplierCompanyId = null;
    let customerCompanyId = null;
    try {
      const sRows = await pgrestGet('suppliers', { select: 'name,company_id', id: `eq.${supplier_id}` });
      supplierNameEarly = sRows?.[0]?.name || 'vendor';
      supplierCompanyId = sRows?.[0]?.company_id || null;
    } catch (_) {}
    try {
      const cRows = await pgrestGet('users', { select: 'company_id', id: `eq.${customer_id}` });
      customerCompanyId = cRows?.[0]?.company_id || null;
    } catch (_) {}

    const companyId = req.user.role === 'super_admin'
      ? (customerCompanyId || supplierCompanyId || req.user.company_id)
      : req.user.company_id;
    const expenseDate = recovery_date || new Date().toISOString().split('T')[0];
    const payMethod = vendor_payment_method; // cash | cheque | bank_transfer

    // cheque / bank transfer always pass through the branch's Direct Transfer account
    let adminBankName = '';
    if (viaBank) {
      const accts = await pgrestGet('bank_accounts', { select: 'id,account_name,bank_name,company_id', company_id: `eq.${companyId}`, is_active: 'eq.true' }).catch(() => []);
      const isDT = (b) => `${b?.account_name || ''} ${b?.bank_name || ''}`.toLowerCase().includes('direct transfer');
      const dt = (accts || []).find(isDT);
      const picked = (accts || []).find((b) => b.id === bank_account_id);
      const acct = dt || picked;
      if (!acct) return error(res, 'No Direct Transfer bank account found for this branch — add one in Bank first.', 400);
      bank_account_id = acct.id;
      adminBankName = acct.account_name || acct.bank_name || 'Direct Transfer';
    }
    const chequeNo = String(cheque_number || '').trim().slice(0, 50);
    const chequeBank = String(cheque_bank || '').trim().slice(0, 100);

    const rowData = {
      company_id:       companyId,
      customer_id,
      salesman_id:      salesman_id || null,
      amount:           Number(amount),
      payment_type:     'vendor_transfer',
      payment_method:   payMethod,
      reference_number: reference_number || null,
      notes:            notes || null,
      status:           'approved',
      approved_by:      req.user.id,
      approved_at:      new Date().toISOString(),
      recovery_date:    expenseDate,
      created_by:       req.user.id,
    };
    if (await hasVendorColumn()) rowData.vendor_id = supplier_id;
    // the cheque's details are kept on the transfer (cheque_status stays empty — it is
    // not a cheque waiting at the bank, the vendor transfer is already done)
    const chequeCols = vendor_payment_method === 'cheque'
      ? { cheque_number: chequeNo, cheque_bank: chequeBank || null, cheque_date: cheque_date || null } : {};

    let recovery;
    try {
      [recovery] = await pgrestPost('salesman_recoveries', { ...rowData, ...chequeCols, photo_url: photo_url || null });
    } catch (e) {
      try { [recovery] = await pgrestPost('salesman_recoveries', { ...rowData, ...chequeCols }); }
      catch (_) { [recovery] = await pgrestPost('salesman_recoveries', rowData); }
    }

    await creditLedger({
      companyId,
      customerId:  customer_id,
      amount:      Number(amount),
      description: `Vendor transfer to ${supplierNameEarly} — customer balance settled`,
      date:        recovery_date,
      userId:      req.user.id,
      referenceId: recovery.id,
    });

    // Every vendor transfer: the Vendor Payment expense + supplier ledger credit
    {
      const supplierName = supplierNameEarly;
      const how = vendor_payment_method === 'cheque'
        ? `Cheque#${chequeNo}${chequeBank ? ` (${chequeBank})` : ''}`
        : vendor_payment_method === 'bank_transfer' ? 'bank transfer' : 'cash';

      const expenseBase = {
        company_id:   companyId,
        category:     'Vendor Payment',
        amount:       Number(amount),
        description:  `Vendor payment to ${supplierName} — ${how}${adminBankName ? ` via ${adminBankName}` : ''}${reference_number ? ` — Ref: ${reference_number}` : ''}`,
        expense_date: expenseDate,
        method:       viaBank ? 'bank' : 'cash',
        ...(viaBank ? { bank_account_id } : {}),
        ...(salesman_id ? { salesman_id } : {}),
      };
      try {
        await pgrestPost('expenses', { ...expenseBase, supplier_id });
      } catch (_) {
        try { await pgrestPost('expenses', expenseBase); } catch (_2) { /* skip */ }
      }

      try {
        const last = await pgrestGet('supplier_ledger_entries', {
          select: 'running_balance', supplier_id: `eq.${supplier_id}`,
          order: 'created_at.desc', limit: '1',
        });
        const prevBal = Number(last?.[0]?.running_balance) || 0;
        const ledgerRow = {
          supplier_id,
          entry_type:      'credit',
          amount:          Number(amount),
          running_balance: prevBal - Number(amount),
          description:     `Admin vendor transfer — via ${vendor_payment_method === 'cash' ? 'cash' : `${vendor_payment_method === 'cheque' ? `cheque #${chequeNo}` : 'bank transfer'} — ${adminBankName}`}`,
          reference_type:  'vendor_transfer',
          created_by:      req.user.id,
          created_at:      new Date(expenseDate).toISOString(),
        };
        try {
          await pgrestPost('supplier_ledger_entries', { ...ledgerRow, company_id: companyId });
        } catch (_) { await pgrestPost('supplier_ledger_entries', ledgerRow); }
      } catch (_) { /* supplier_ledger_entries may not exist — skip */ }
    }

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
      order: 'recovery_date.desc,created_at.desc',
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

// PATCH /api/v1/recovery/:id/date — admin corrects the date on any recovery entry.
// Updates: salesman_recoveries.recovery_date, linked ledger_entries.created_at,
// and (for vendor_transfer) linked expenses.expense_date + supplier_ledger_entries.created_at.
router.patch('/:id/date', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_date } = req.body;
    if (!new_date || !/^\d{4}-\d{2}-\d{2}$/.test(new_date))
      return error(res, 'new_date is required (YYYY-MM-DD)', 400);

    // Fetch the recovery
    const rows = await pgrestGet('salesman_recoveries', {
      select: 'id,company_id,amount,recovery_date,payment_type,customer_id,vendor_id',
      ...scopeFilter(req),
      limit: '1',
    });
    const rec = rows?.[0];
    if (!rec) return error(res, 'Recovery not found or access denied', 404);

    const oldDate = (rec.recovery_date || '').split('T')[0];
    const newTs = `${new_date}T00:00:00.000Z`;

    // 1. Update recovery_date on the main record
    await pgrestPatch('salesman_recoveries', { id: `eq.${id}` }, { recovery_date: new_date });

    // 2. Update customer ledger entry date (reference_id = recovery id)
    try {
      const { pgrestGetRaw } = require('../utils/directQuery');
      const ledRows = await pgrestGetRaw(
        `ledger_entries?select=id&reference_id=eq.${id}&limit=5`
      ).catch(() => []);
      for (const le of (ledRows || [])) {
        await pgrestPatch('ledger_entries', { id: `eq.${le.id}` }, { created_at: newTs });
      }
    } catch (_) {}

    // 3. For vendor_transfer: update expense_date + supplier_ledger_entries.created_at
    if (rec.payment_type === 'vendor_transfer') {
      // Update expense
      try {
        const expRows = await pgrestGet('expenses', {
          select: 'id',
          company_id: `eq.${rec.company_id}`,
          category: 'eq.Vendor Payment',
          amount: `eq.${Number(rec.amount)}`,
          expense_date: `eq.${oldDate}`,
          order: 'created_at.desc',
          limit: '3',
        });
        for (const exp of (expRows || [])) {
          await pgrestPatch('expenses', { id: `eq.${exp.id}` }, { expense_date: new_date });
        }
      } catch (_) {}

      // Update supplier ledger entry
      try {
        const { pgrestGetRaw } = require('../utils/directQuery');
        const sleRows = await pgrestGetRaw(
          `supplier_ledger_entries?select=id,supplier_id&amount=eq.${Number(rec.amount)}&created_at=gte.${oldDate}T00:00:00.000Z&created_at=lte.${oldDate}T23:59:59.999Z&limit=3`
        ).catch(() => []);
        for (const sle of (sleRows || [])) {
          await pgrestPatch('supplier_ledger_entries', { id: `eq.${sle.id}` }, { created_at: newTs });
        }
      } catch (_) {}
    }

    return success(res, { id, new_date }, 'Date updated successfully');
  } catch (err) { return error(res, err.message, err.status || 500); }
});

// ════════════════════════════════════════════════════════════════
// Vendor-transfer amount changes (requested from the Vendor Ledger, approved here)
// ════════════════════════════════════════════════════════════════

const REQUEST_TABLE = 'vendor_amount_change_requests';
const adminName = (req) => req.user.full_name || req.user.email || 'Admin';

// GET /api/v1/recovery/amount-changes?status=pending&supplier_id=&company_id=
router.get('/amount-changes', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: '*', order: 'created_at.desc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (req.query.supplier_id) params.supplier_id = `eq.${req.query.supplier_id}`;
    params.status = `eq.${req.query.status || 'pending'}`;
    let rows = [];
    try { rows = await pgrestGet(REQUEST_TABLE, params); } catch (_) { /* table not created yet — nothing pending */ }
    return success(res, rows || []);
  } catch (err) { return error(res, err.message); }
});

async function loadOwnRequest(req) {
  const rows = await pgrestGet(REQUEST_TABLE, { select: '*', ...scopeFilter(req) });
  return rows?.[0] || null;
}

// PATCH /api/v1/recovery/amount-changes/:id/approve — applies the new amount everywhere the
// transfer shows up: vendor ledger, salesman recovery (History), customer ledger, expense.
router.patch('/amount-changes/:id/approve', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await loadOwnRequest(req);
    if (!request) return error(res, 'Request not found or access denied', 404);
    if (request.status !== 'pending') return error(res, `This request is already ${request.status}.`, 400);

    const oldAmount = Number(request.old_amount);
    const newAmount = Number(request.new_amount);

    const entries = await pgrestGet('supplier_ledger_entries', { select: 'id,amount,created_at', id: `eq.${request.supplier_ledger_entry_id}` });
    const entry = entries?.[0];
    if (!entry) return error(res, 'The vendor ledger entry no longer exists.', 409);
    if (Number(entry.amount) !== oldAmount) return error(res, 'The vendor ledger amount was changed since this request — reject it and raise a new one.', 409);

    // 1. Vendor ledger
    await pgrestPatch('supplier_ledger_entries', { id: `eq.${entry.id}` }, { amount: newAmount });
    try { await recalcSupplierLedger(request.supplier_id); } catch (_) {}

    // 2. Salesman recovery (History) + 3. customer ledger
    let recovery = null;
    if (request.recovery_id) {
      const recs = await pgrestGet('salesman_recoveries', { select: 'id,salesman_id,company_id,customer_id,recovery_date', id: `eq.${request.recovery_id}` });
      recovery = recs?.[0] || null;
      if (recovery) {
        await pgrestPatch('salesman_recoveries', { id: `eq.${recovery.id}` }, { amount: newAmount });
        const led = await pgrestGet('ledger_entries', { select: 'id', reference_id: `eq.${recovery.id}`, reference_type: 'eq.recovery' });
        for (const l of (led || [])) await pgrestPatch('ledger_entries', { id: `eq.${l.id}` }, { amount: newAmount });
        try { await recalcCustomerLedger(recovery.customer_id); } catch (_) {}
      }
    }

    // 4. Expense (feeds Daily Report, cash in hand and the Bank ledger)
    try {
      const day = String(recovery?.recovery_date || entry.created_at || '').slice(0, 10);
      const base = { select: 'id', company_id: `eq.${request.company_id}`, category: 'eq.Vendor Payment', amount: `eq.${oldAmount}`, expense_date: `eq.${day}`, order: 'created_at.desc', limit: '1' };
      let exp = await pgrestGet('expenses', { ...base, supplier_id: `eq.${request.supplier_id}` }).catch(() => []);
      if (!exp?.[0] && request.supplier_name) exp = await pgrestGet('expenses', { ...base, description: `ilike.*${request.supplier_name}*` }).catch(() => []);
      if (exp?.[0]) await pgrestPatch('expenses', { id: `eq.${exp[0].id}` }, { amount: newAmount });
    } catch (_) { /* expense sync is best-effort */ }

    await pgrestPatch(REQUEST_TABLE, { id: `eq.${request.id}` }, {
      status: 'approved', decided_by: req.user.id, decided_by_name: adminName(req), decided_at: new Date().toISOString(),
    });

    if (recovery?.salesman_id) {
      await notifyUser({
        companyId: recovery.company_id, recipientId: recovery.salesman_id,
        title: 'Vendor transfer amount changed',
        body: `Your vendor transfer to ${request.supplier_name || 'the vendor'} was changed from PKR ${oldAmount.toLocaleString()} to PKR ${newAmount.toLocaleString()} by the office.`,
        type: 'payment', referenceId: recovery.id,
      });
    }
    return success(res, { approved: true, linked_recovery: !!recovery }, 'Amount change approved and applied everywhere');
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/recovery/amount-changes/:id/reject { reason? } — nothing changes anywhere.
router.patch('/amount-changes/:id/reject', authenticate, isAdmin, async (req, res) => {
  try {
    const request = await loadOwnRequest(req);
    if (!request) return error(res, 'Request not found or access denied', 404);
    if (request.status !== 'pending') return error(res, `This request is already ${request.status}.`, 400);
    await pgrestPatch(REQUEST_TABLE, { id: `eq.${request.id}` }, {
      status: 'rejected', decided_by: req.user.id, decided_by_name: adminName(req), decided_at: new Date().toISOString(),
      decision_note: String(req.body?.reason || '').slice(0, 200) || null,
    });
    return success(res, { rejected: true }, 'Amount change rejected');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
