const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/bank/accounts?company_id=
const getBankAccounts = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,account_name,account_number,bank_name,branch_name,is_active,opening_balance,opening_balance_date,created_at',
      is_active: 'eq.true',
      order: 'account_name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('bank_accounts', params);
    return success(res, data);
  } catch (err) {
    // bank_accounts is a phase18 addition — read as empty rather than
    // breaking the Bank page before that migration has run.
    return success(res, []);
  }
};

// POST /api/v1/bank/accounts
const createBankAccount = async (req, res) => {
  try {
    const { account_name, account_number, bank_name, branch_name, company_id } = req.body;
    if (!account_name || !account_number || !bank_name)
      return error(res, 'account_name, account_number, bank_name are required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const { opening_balance, opening_balance_date } = req.body;

    const [data] = await pgrestPost('bank_accounts', {
      company_id:            targetCompanyId,
      account_name,
      account_number,
      bank_name,
      branch_name:           branch_name || null,
      is_active:             true,
      opening_balance:       Number(opening_balance) || 0,
      opening_balance_date:  opening_balance_date || null,
    });

    return success(res, data, 'Bank account added', 201);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/transactions?from=&to=&company_id= — every bank-method
// movement on a bank account, both directions: money IN (approved
// customer payments / salesman recoveries collected via bank transfer —
// Feature 7's Recovery form, written through /payments) and money OUT
// (expenses paid from a bank account, written through /expenses). Each
// row carries a `type` of 'payment' or 'expense' so the UI can tell them
// apart — this is a read-only view over those two tables, not a
// separate ledger.
// Cash payments (method='cash') are included and tagged under the
// "Cash in Hand" virtual account so the Bank page can show a cash total.
const getBankTransactions = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    // ── Bank-transfer payments (bank_account_id set) ──
    const paymentParts = [
      'select=id,amount,method,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name),bank_accounts(account_name,bank_name,account_number)',
      'bank_account_id=not.is.null',
      'status=eq.approved',
      'order=created_at.desc',
    ];
    if (companyId) paymentParts.push(`company_id=eq.${companyId}`);
    if (from) paymentParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   paymentParts.push(`created_at=lte.${to}T23:59:59`);

    let payments = [];
    try {
      payments = await pgrestGetRaw(`payments?${paymentParts.join('&')}`);
    } catch (e) { /* bank_account_id is a phase18 addition */ }

    // ── Cash payments (no bank_account_id) — tagged as "Cash in Hand" ──
    // (old-style `payments` table entries — most cash now goes through salesman_recoveries)
    const cashParts = [
      'select=id,amount,method,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'bank_account_id=is.null',
      'method=eq.cash',
      'status=eq.approved',
      'order=created_at.desc',
    ];
    if (companyId) cashParts.push(`company_id=eq.${companyId}`);
    if (from) cashParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   cashParts.push(`created_at=lte.${to}T23:59:59`);

    let cashPayments = [];
    try {
      const raw = await pgrestGetRaw(`payments?${cashParts.join('&')}`);
      cashPayments = (raw || []).map((p) => ({
        ...p,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Salesman / driver cash recoveries — the PRIMARY source of Cash in Hand ──
    // Every approved cash collection by a salesman or driver that has NOT been
    // deposited yet is physically held as cash. Tagged as Cash in Hand (IN).
    const recoveryParts = [
      'select=id,amount,recovery_date,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'payment_type=eq.cash',
      'status=eq.approved',
      'order=recovery_date.desc',
    ];
    if (companyId) recoveryParts.push(`company_id=eq.${companyId}`);
    if (from) recoveryParts.push(`recovery_date=gte.${from}`);
    if (to)   recoveryParts.push(`recovery_date=lte.${to}`);

    let cashRecoveries = [];
    try {
      const raw = await pgrestGetRaw(`salesman_recoveries?${recoveryParts.join('&')}`);
      cashRecoveries = (raw || []).map((r) => ({
        ...r,
        method: 'cash',
        created_at: r.recovery_date || r.created_at,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cash closings (approved deposits) — Cash in Hand OUT ──
    // When a salesman deposits their cash (to bank or petty cash) and an admin
    // approves it, that money physically leaves Cash in Hand. Tag as expense so
    // the balance calculation subtracts it from the Cash in Hand total.
    const closingParts = [
      'select=id,amount,deposit_to,bank_account,closing_date,created_at,salesmen(full_name)',
      'status=eq.approved',
      'order=closing_date.desc',
    ];
    if (companyId) closingParts.push(`company_id=eq.${companyId}`);
    if (from) closingParts.push(`closing_date=gte.${from}`);
    if (to)   closingParts.push(`closing_date=lte.${to}`);

    let cashClosings = [];
    try {
      const raw = await pgrestGetRaw(`salesman_cash_closings?${closingParts.join('&')}`);
      cashClosings = (raw || []).map((c) => ({
        ...c,
        type: 'expense',
        method: 'cash',
        created_at: c.closing_date || c.created_at,
        category: 'Cash Deposit',
        description: `${c.salesmen?.full_name || 'Salesman'} deposited to ${c.deposit_to === 'bank' ? `bank${c.bank_account ? ` (${c.bank_account})` : ''}` : 'petty cash'}`,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cash expenses (method=cash, no bank_account) — Cash in Hand OUT ──
    const cashExpParts = [
      'select=id,amount,category,description,expense_date',
      'method=eq.cash',
      'bank_account_id=is.null',
      'order=expense_date.desc',
    ];
    if (companyId) cashExpParts.push(`company_id=eq.${companyId}`);
    if (from) cashExpParts.push(`expense_date=gte.${from}`);
    if (to)   cashExpParts.push(`expense_date=lte.${to}`);

    let cashExpenses = [];
    try {
      const raw = await pgrestGetRaw(`expenses?${cashExpParts.join('&')}`);
      cashExpenses = (raw || []).map((e) => ({
        ...e,
        type: 'expense',
        method: 'cash',
        created_at: e.expense_date,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cheques cleared into a bank account (salesman_recoveries, phase72) ──
    let chequeIn = [];
    try {
      const chequeParts = [
        'select=id,amount,cleared_at,cheque_number,cheque_bank,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name),bank_accounts:bank_accounts!cleared_bank_account_id(account_name,bank_name,account_number)',
        'cleared_bank_account_id=not.is.null',
        'status=eq.approved',
      ];
      if (companyId) chequeParts.push(`company_id=eq.${companyId}`);
      if (from) chequeParts.push(`cleared_at=gte.${from}T00:00:00`);
      if (to)   chequeParts.push(`cleared_at=lte.${to}T23:59:59`);
      chequeIn = await pgrestGetRaw(`salesman_recoveries?${chequeParts.join('&')}`);
    } catch (e) { /* phase72 not run yet */ }

    // ── Expenses paid from a bank account (debit) ──
    const expenseParts = [
      'select=id,amount,method,category,description,expense_date,bank_accounts(account_name,bank_name,account_number),cash_amount,bank_amount',
      'bank_account_id=not.is.null',
      'order=expense_date.desc',
    ];
    if (companyId) expenseParts.push(`company_id=eq.${companyId}`);
    if (from) expenseParts.push(`expense_date=gte.${from}`);
    if (to)   expenseParts.push(`expense_date=lte.${to}`);

    let expenses = [];
    try {
      expenses = await pgrestGetRaw(`expenses?${expenseParts.join('&')}`);
    } catch (e) {
      try {
        expenses = await pgrestGetRaw(`expenses?${expenseParts.join('&').replace(',cash_amount,bank_amount', '')}`);
      } catch (e2) { /* bank_account_id is a phase24 addition */ }
    }

    // ── Bank-account ID→info map (for bank transfers below) ──
    let accountMap = {};
    try {
      const accts = await pgrestGetRaw(
        `bank_accounts?select=id,account_name,bank_name,account_number${companyId ? `&company_id=eq.${companyId}` : ''}`
      );
      (accts || []).forEach(a => {
        accountMap[a.id] = { account_name: a.account_name, bank_name: a.bank_name, account_number: a.account_number };
      });
    } catch (e) { /* ignore */ }

    // ── Bank-transfer recoveries routed to a specific account (reference_number = account UUID) ──
    // These are the primary way salesmen record payments received via bank transfer.
    // They were missing from the transactions list, causing wrong balances in the accounts table.
    const btParts = [
      'select=id,amount,recovery_date,created_at,notes,reference_number,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'payment_method=eq.bank_transfer',
      'status=eq.approved',
      'reference_number=not.is.null',
      'order=recovery_date.desc',
    ];
    if (companyId) btParts.push(`company_id=eq.${companyId}`);
    if (from) btParts.push(`recovery_date=gte.${from}`);
    if (to)   btParts.push(`recovery_date=lte.${to}`);

    let bankTransferRecoveries = [];
    try {
      const raw = await pgrestGetRaw(`salesman_recoveries?${btParts.join('&')}`);
      bankTransferRecoveries = (raw || [])
        .filter(r => accountMap[r.reference_number])
        .map(r => ({
          ...r,
          type: 'payment',
          method: 'bank_transfer',
          created_at: r.recovery_date || r.created_at,
          bank_accounts: accountMap[r.reference_number],
        }));
    } catch (e) { /* ignore */ }

    const merged = [
      ...(payments    || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashPayments || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashRecoveries || []).map((r) => ({ ...r, type: 'payment' })),
      ...(chequeIn   || []).map((c) => ({ ...c, type: 'payment', method: 'cheque', created_at: c.cleared_at })),
      ...bankTransferRecoveries,
      ...(expenses   || []).map((e) => ({
        ...e,
        type: 'expense',
        amount: e.method === 'split' ? Number(e.bank_amount || 0) : e.amount,
        created_at: e.expense_date,
      })),
      ...(cashClosings || []),
      ...(cashExpenses || []),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return success(res, merged);
  } catch (err) {
    return success(res, []);
  }
};

// PATCH /api/v1/bank/accounts/:id/opening-balance
const updateOpeningBalance = async (req, res) => {
  try {
    const { opening_balance, opening_balance_date } = req.body;
    if (opening_balance === undefined || isNaN(Number(opening_balance)))
      return error(res, 'opening_balance must be a number', 400);

    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const patch = { opening_balance: Number(opening_balance) };
    if (opening_balance_date) patch.opening_balance_date = opening_balance_date;

    const rows = await pgrestPatch('bank_accounts', filter, patch);
    if (!rows?.[0]) return error(res, 'Account not found or access denied', 404);
    return success(res, rows[0], 'Opening balance updated');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/accounts/:id/ledger
// Full chronological ledger for one bank account: opening balance, then all
// inflows (bank transfers + cleared cheques) and outflows (expenses) with
// a running balance — mirrors the customer ledger pattern.
const getBankLedger = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await pgrestGet('bank_accounts', {
      select: 'id,account_name,bank_name,account_number,opening_balance,opening_balance_date,company_id,created_at',
      id: `eq.${id}`,
    });
    const account = rows?.[0];
    if (!account) return error(res, 'Bank account not found', 404);
    if (req.user.role !== 'super_admin' && account.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    const [transfers, cheques, expenses] = await Promise.all([
      // Bank-transfer recoveries routed to this account (reference_number = account UUID)
      pgrestGetRaw(
        `salesman_recoveries?select=id,amount,recovery_date,created_at,notes,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&payment_method=eq.bank_transfer&status=eq.approved&reference_number=eq.${id}`
      ).catch(() => []),

      // Cheques cleared into this account
      pgrestGetRaw(
        `salesman_recoveries?select=id,amount,cleared_at,cheque_number,cheque_bank,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&cleared_bank_account_id=eq.${id}&status=eq.approved`
      ).catch(() => []),

      // Expenses paid from this account
      pgrestGetRaw(
        `expenses?select=id,amount,expense_date,category,description,method,bank_amount&bank_account_id=eq.${id}`
      ).catch(() => []),
    ]);

    const entries = [];

    // Opening balance (always shown as first entry)
    const openingBal = Number(account.opening_balance || 0);
    entries.push({
      id: 'opening',
      date: account.opening_balance_date || account.created_at,
      type: 'opening',
      description: 'Opening Balance',
      debit: openingBal,
      credit: 0,
    });

    for (const r of (transfers || [])) {
      const name = r.customer?.shop_name || r.customer?.full_name || '—';
      const note = r.notes ? r.notes.replace(/Bank:\s*[^·]+·?\s*/i, '').trim() : '';
      entries.push({
        id: r.id,
        date: r.recovery_date || r.created_at,
        type: 'transfer_in',
        description: `Bank Transfer — ${name}${note ? ` (${note})` : ''}${r.salesman?.full_name ? ` via ${r.salesman.full_name}` : ''}`,
        debit: Number(r.amount || 0),
        credit: 0,
      });
    }

    for (const c of (cheques || [])) {
      const name = c.customer?.shop_name || c.customer?.full_name || '—';
      entries.push({
        id: c.id,
        date: c.cleared_at,
        type: 'cheque_in',
        description: `Cheque Cleared — ${name}${c.cheque_number ? ` #${c.cheque_number}` : ''}${c.cheque_bank ? ` (${c.cheque_bank})` : ''}`,
        debit: Number(c.amount || 0),
        credit: 0,
      });
    }

    for (const e of (expenses || [])) {
      const amt = e.method === 'split' ? Number(e.bank_amount || 0) : Number(e.amount || 0);
      entries.push({
        id: e.id,
        date: e.expense_date,
        type: 'expense',
        description: `${e.category || 'Expense'}${e.description ? ` — ${e.description}` : ''}`,
        debit: 0,
        credit: amt,
      });
    }

    // Sort ascending by date, opening always first
    entries.sort((a, b) => {
      if (a.type === 'opening') return -1;
      if (b.type === 'opening') return 1;
      return new Date(a.date) - new Date(b.date);
    });

    // Compute running balance
    let running = 0;
    for (const e of entries) {
      running += e.debit - e.credit;
      e.balance = running;
    }

    return success(res, { account, entries });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/summary
// Lightweight all-time balance snapshot for the Dashboard widget:
// Cash in Hand (all cash in minus all deposits/closings/cash-expenses) +
// per-bank current balance (opening + all-time transfers in + cheques cleared in − expenses out).
const getBankSummary = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const cf = companyId ? `&company_id=eq.${companyId}` : '';
    const cfObj = companyId ? { company_id: `eq.${companyId}` } : {};

    const [accounts, cashRec, cashClose, cashExp, allTransfers, allCheques, allBankExp] = await Promise.all([
      pgrestGet('bank_accounts', {
        select: 'id,account_name,bank_name,account_number,opening_balance',
        is_active: 'eq.true',
        ...cfObj,
        order: 'account_name.asc',
      }).catch(() => []),

      pgrestGet('salesman_recoveries', {
        select: 'amount',
        payment_type: 'eq.cash',
        status: 'eq.approved',
        ...cfObj,
      }).catch(() => []),

      pgrestGet('salesman_cash_closings', {
        select: 'amount',
        status: 'eq.approved',
        ...cfObj,
      }).catch(() => []),

      pgrestGet('expenses', {
        select: 'amount',
        method: 'eq.cash',
        bank_account_id: 'is.null',
        ...cfObj,
      }).catch(() => []),

      pgrestGet('salesman_recoveries', {
        select: 'amount,reference_number',
        payment_method: 'eq.bank_transfer',
        status: 'eq.approved',
        reference_number: 'not.is.null',
        ...cfObj,
      }).catch(() => []),

      pgrestGetRaw(
        `salesman_recoveries?select=amount,cleared_bank_account_id&cleared_bank_account_id=not.is.null&status=eq.approved${cf}`
      ).catch(() => []),

      pgrestGet('expenses', {
        select: 'amount,bank_account_id,method,bank_amount',
        bank_account_id: 'not.is.null',
        ...cfObj,
      }).catch(() => []),
    ]);

    const cashIn  = (cashRec   || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const cashOut = (cashClose || []).reduce((s, c) => s + Number(c.amount || 0), 0)
                  + (cashExp   || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const cashInHand = cashIn - cashOut;

    const inMap = {};
    (allTransfers || []).forEach(r => {
      const id = r.reference_number;
      if (id) inMap[id] = (inMap[id] || 0) + Number(r.amount || 0);
    });
    (allCheques || []).forEach(r => {
      const id = r.cleared_bank_account_id;
      if (id) inMap[id] = (inMap[id] || 0) + Number(r.amount || 0);
    });
    const outMap = {};
    (allBankExp || []).forEach(e => {
      const id = e.bank_account_id;
      const amt = e.method === 'split' ? Number(e.bank_amount || 0) : Number(e.amount || 0);
      if (id) outMap[id] = (outMap[id] || 0) + amt;
    });

    const accountsWithBalance = (accounts || []).map(a => ({
      id: a.id,
      account_name: a.account_name,
      bank_name: a.bank_name,
      account_number: a.account_number,
      current_balance: Number(a.opening_balance || 0) + (inMap[a.id] || 0) - (outMap[a.id] || 0),
    }));

    const totalBank = accountsWithBalance.reduce((s, a) => s + a.current_balance, 0);

    return success(res, {
      cash_in_hand: cashInHand,
      accounts: accountsWithBalance,
      total_bank: totalBank,
      grand_total: cashInHand + totalBank,
    });
  } catch (err) { return error(res, err.message); }
};

module.exports = { getBankAccounts, createBankAccount, getBankTransactions, updateOpeningBalance, getBankLedger, getBankSummary };
