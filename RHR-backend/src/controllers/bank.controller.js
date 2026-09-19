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

// GET /api/v1/bank/transactions?from=&to=&company_id= — approved
// payments recorded against a bank account (Feature 7's Recovery form
// writes these through the existing /payments endpoint with
// method: 'bank' + bank_account_id) — this is a read-only view over
// that same data, not a separate ledger.
const getBankTransactions = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const parts = [
      'select=id,amount,method,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name),bank_accounts(account_name,bank_name,account_number)',
      'bank_account_id=not.is.null',
      'status=eq.approved',
      'order=created_at.desc',
    ];
    if (companyId) parts.push(`company_id=eq.${companyId}`);
    if (from) parts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   parts.push(`created_at=lte.${to}T23:59:59`);

    const data = await pgrestGetRaw(`payments?${parts.join('&')}`);
    return success(res, data);
  } catch (err) {
    // bank_account_id is a phase18 addition.
    return success(res, []);
  }
};

module.exports = { getBankAccounts, createBankAccount, getBankTransactions };
