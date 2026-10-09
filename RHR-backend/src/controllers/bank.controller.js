const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw, pgrestPost } = require('../utils/directQuery');

// GET /api/v1/bank/accounts?company_id=
const getBankAccounts = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,account_name,account_number,bank_name,branch_name,is_active,created_at',
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

    const [data] = await pgrestPost('bank_accounts', {
      company_id:     targetCompanyId,
      account_name,
      account_number,
      bank_name,
      branch_name:    branch_name || null,
      is_active:      true,
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
const getBankTransactions = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

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

    const expenseParts = [
      'select=id,amount,method,category,description,expense_date,bank_accounts(account_name,bank_name,account_number)',
      'bank_account_id=not.is.null',
      'order=expense_date.desc',
    ];
    if (companyId) expenseParts.push(`company_id=eq.${companyId}`);
    if (from) expenseParts.push(`expense_date=gte.${from}`);
    if (to)   expenseParts.push(`expense_date=lte.${to}`);

    let expenses = [];
    try {
      expenses = await pgrestGetRaw(`expenses?${expenseParts.join('&')}`);
    } catch (e) { /* bank_account_id is a phase24 addition */ }

    const merged = [
      ...(payments || []).map((p) => ({ ...p, type: 'payment' })),
      ...(expenses || []).map((e) => ({ ...e, type: 'expense', created_at: e.expense_date })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return success(res, merged);
  } catch (err) {
    return success(res, []);
  }
};

module.exports = { getBankAccounts, createBankAccount, getBankTransactions };
