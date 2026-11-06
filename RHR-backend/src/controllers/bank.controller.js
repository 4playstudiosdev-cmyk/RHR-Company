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

    const merged = [
      ...(payments    || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashPayments || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashRecoveries || []).map((r) => ({ ...r, type: 'payment' })),
      ...(chequeIn   || []).map((c) => ({ ...c, type: 'payment', method: 'cheque', created_at: c.cleared_at })),
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

module.exports = { getBankAccounts, createBankAccount, getBankTransactions, updateOpeningBalance };
