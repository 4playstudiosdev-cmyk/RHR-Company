const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

const EXPENSE_CATEGORIES = [
  'Fuel', 'Vehicle Maintenance', 'Office Supplies', 'Utilities', 'Rent',
  'Salaries', 'Transport', 'Raw Material Purchase', 'Equipment', 'Other'
];

// GET /api/v1/expenses?from=&to=&company_id= — a gte/lte range on the
// same column (expense_date) needs two separate query-string entries,
// which a plain {key: value} params object can't express, so this goes
// through pgrestGetRaw with a hand-built query string instead of pgrestGet.
const getExpenses = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const filters = [];
    if (companyId) filters.push(`company_id=eq.${companyId}`);
    if (from) filters.push(`expense_date=gte.${from}`);
    if (to)   filters.push(`expense_date=lte.${to}`);
    const filterStr = filters.length ? `&${filters.join('&')}` : '';

    // cash_amount/bank_amount (phase46, for a split cash+online purchase
    // as ONE row), supplier_id (phase45), salesman_id/manufacturing_worker_id
    // (phase44), method/bank_account_id (phase24), driver_id (phase25) and
    // vehicle_id/fuel_*/bags_delivered (phase30) are separate additions —
    // fall back a level at a time if any hasn't run yet, same pattern
    // used for the other phase18 bank_account_id columns, so this never
    // breaks mid-migration.
    // receipt_url (phase67) — photo of the bill. Tried first; if the column
    // hasn't been added yet this fails and the older lists below take over.
    // expense_account_id (phase71) — the person/shop the expense was for. Tried first.
    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),supplier_id,suppliers(name),cash_amount,bank_amount,receipt_url,expense_account_id,expense_accounts(name),created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (eAccount) { /* expense_accounts / expense_account_id not added yet */ }

    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),supplier_id,suppliers(name),cash_amount,bank_amount,receipt_url,created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (eReceipt) { /* receipt_url column not added yet */ }

    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),supplier_id,suppliers(name),cash_amount,bank_amount,created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (eSplit) {
    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),supplier_id,suppliers(name),created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (eSupplier) {
    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (e0) {
    try {
      const data = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),fuel_price_per_liter,fuel_liters,bags_delivered,created_at&order=expense_date.desc${filterStr}`
      );
      return success(res, data);
    } catch (e) {
      try {
        const data = await pgrestGetRaw(
          `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),created_at&order=expense_date.desc${filterStr}`
        );
        return success(res, data);
      } catch (e2) {
        try {
          const data = await pgrestGetRaw(
            `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),created_at&order=expense_date.desc${filterStr}`
          );
          return success(res, data);
        } catch (e3) {
          const data = await pgrestGetRaw(
            `expenses?select=id,company_id,category,amount,description,expense_date,created_at&order=expense_date.desc${filterStr}`
          );
          return success(res, data);
        }
      }
    }
    }
    }
    }
  } catch (err) { return error(res, err.message); }
};

// Attaches the receipt photo (if one was sent) to the expense that was
// just created, then answers. It's a separate write — receipt_url is a
// phase67 column and the insert above has several older fallbacks — so an
// environment that hasn't added the column yet still records the expense
// and tells the caller the photo wasn't kept, instead of losing it silently.
async function respondCreated(res, expense, receiptUrl) {
  if (!receiptUrl) return success(res, expense, 'Expense recorded', 201);
  try {
    const [withReceipt] = await pgrestPatch('expenses', { id: `eq.${expense.id}` }, { receipt_url: receiptUrl });
    return success(res, withReceipt || { ...expense, receipt_url: receiptUrl }, 'Expense recorded', 201);
  } catch (e) {
    return success(res, { ...expense, receipt_saved: false },
      'Expense recorded, but the photo could not be attached — run sql/phase67_expense_receipt_photo.sql in Supabase first', 201);
  }
}

// POST /api/v1/expenses
const createExpense = async (req, res) => {
  try {
    const {
      category, amount, description, expense_date, company_id, method, bank_account_id, driver_id,
      vehicle_id, fuel_price_per_liter, fuel_liters, bags_delivered,
      salesman_id, manufacturing_worker_id, supplier_id, cash_amount, bank_amount, receipt_url,
      expense_account_id,
    } = req.body;
    if (!category || !amount || Number(amount) <= 0)
      return error(res, 'category and a positive amount are required', 400);
    if (!EXPENSE_CATEGORIES.includes(category))
      return error(res, `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`, 400);
    if (method === 'bank' && !bank_account_id)
      return error(res, 'bank_account_id is required when method is bank', 400);
    if (method === 'split' && Number(bank_amount) > 0 && !bank_account_id)
      return error(res, 'bank_account_id is required when any amount is paid online', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const baseRow = {
      company_id:   targetCompanyId,
      category,
      amount:       Number(amount),
      description:  description || null,
      expense_date: expense_date || new Date().toISOString().split('T')[0],
      created_by:   req.user.id,
    };

    const resolvedMethod = method === 'split' ? 'split' : method === 'bank' ? 'bank' : 'cash';

    if (expense_account_id) {
      try {
        const [data] = await pgrestPost('expenses', {
          ...baseRow,
          method: resolvedMethod,
          bank_account_id: resolvedMethod !== 'cash' ? bank_account_id : null,
          driver_id: driver_id || null,
          salesman_id: salesman_id || null,
          manufacturing_worker_id: manufacturing_worker_id || null,
          supplier_id: supplier_id || null,
          expense_account_id,
          cash_amount: resolvedMethod === 'split' ? Number(cash_amount) || 0 : null,
          bank_amount: resolvedMethod === 'split' ? Number(bank_amount) || 0 : null,
        });
        return respondCreated(res, data, receipt_url);
      } catch (e) {
        return error(res, 'Could not save this expense for the account — run sql/phase71_expense_accounts.sql in Supabase first. (' + e.message + ')', 400);
      }
    }

    // cash_amount/bank_amount (phase46), supplier_id (phase45),
    // salesman_id/manufacturing_worker_id (phase44), method/bank_account_id
    // (phase24), driver_id (phase25) and vehicle_id/fuel_*/bags_delivered
    // (phase30) are separate additions — fall back a level at a time if
    // any hasn't run yet, mirroring getExpenses above.
    try {
      const [data] = await pgrestPost('expenses', {
        ...baseRow,
        method: resolvedMethod,
        bank_account_id: resolvedMethod !== 'cash' ? bank_account_id : null,
        driver_id: driver_id || null,
        vehicle_id: vehicle_id || null,
        fuel_price_per_liter: fuel_price_per_liter ? Number(fuel_price_per_liter) : null,
        fuel_liters: fuel_liters ? Number(fuel_liters) : null,
        bags_delivered: bags_delivered ? Number(bags_delivered) : null,
        salesman_id: salesman_id || null,
        manufacturing_worker_id: manufacturing_worker_id || null,
        supplier_id: supplier_id || null,
        cash_amount: resolvedMethod === 'split' ? Number(cash_amount) || 0 : null,
        bank_amount: resolvedMethod === 'split' ? Number(bank_amount) || 0 : null,
      });
      return respondCreated(res, data, receipt_url);
    } catch (eSplit) {
    try {
      const [data] = await pgrestPost('expenses', {
        ...baseRow,
        method: method === 'bank' ? 'bank' : 'cash',
        bank_account_id: method === 'bank' ? bank_account_id : null,
        driver_id: driver_id || null,
        vehicle_id: vehicle_id || null,
        fuel_price_per_liter: fuel_price_per_liter ? Number(fuel_price_per_liter) : null,
        fuel_liters: fuel_liters ? Number(fuel_liters) : null,
        bags_delivered: bags_delivered ? Number(bags_delivered) : null,
        salesman_id: salesman_id || null,
        manufacturing_worker_id: manufacturing_worker_id || null,
        supplier_id: supplier_id || null,
      });
      return respondCreated(res, data, receipt_url);
    } catch (eSupplier) {
    try {
      const [data] = await pgrestPost('expenses', {
        ...baseRow,
        method: method === 'bank' ? 'bank' : 'cash',
        bank_account_id: method === 'bank' ? bank_account_id : null,
        driver_id: driver_id || null,
        vehicle_id: vehicle_id || null,
        fuel_price_per_liter: fuel_price_per_liter ? Number(fuel_price_per_liter) : null,
        fuel_liters: fuel_liters ? Number(fuel_liters) : null,
        bags_delivered: bags_delivered ? Number(bags_delivered) : null,
        salesman_id: salesman_id || null,
        manufacturing_worker_id: manufacturing_worker_id || null,
      });
      return respondCreated(res, data, receipt_url);
    } catch (e0) {
    try {
      const [data] = await pgrestPost('expenses', {
        ...baseRow,
        method: method === 'bank' ? 'bank' : 'cash',
        bank_account_id: method === 'bank' ? bank_account_id : null,
        driver_id: driver_id || null,
        vehicle_id: vehicle_id || null,
        fuel_price_per_liter: fuel_price_per_liter ? Number(fuel_price_per_liter) : null,
        fuel_liters: fuel_liters ? Number(fuel_liters) : null,
        bags_delivered: bags_delivered ? Number(bags_delivered) : null,
      });
      return respondCreated(res, data, receipt_url);
    } catch (e) {
      try {
        const [data] = await pgrestPost('expenses', {
          ...baseRow,
          method: method === 'bank' ? 'bank' : 'cash',
          bank_account_id: method === 'bank' ? bank_account_id : null,
          driver_id: driver_id || null,
        });
        return respondCreated(res, data, receipt_url);
      } catch (e2) {
        try {
          const [data] = await pgrestPost('expenses', {
            ...baseRow,
            method: method === 'bank' ? 'bank' : 'cash',
            bank_account_id: method === 'bank' ? bank_account_id : null,
          });
          return respondCreated(res, data, receipt_url);
        } catch (e3) {
          const [data] = await pgrestPost('expenses', baseRow);
          return respondCreated(res, data, receipt_url);
        }
      }
    }
    }
    }
    }
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/expenses/:id
const deleteExpense = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const deleted = await pgrestDelete('expenses', filter);
    if (!deleted?.[0]) return error(res, 'Expense not found or access denied', 404);
    return success(res, { deleted: true }, 'Expense deleted');
  } catch (err) { return error(res, err.message); }
};

// ── Expense accounts (phase71): the people / shops expenses are recorded against ──
// GET /api/v1/expenses/accounts?company_id= — active accounts of the branch (empty list if
// phase71 hasn't been run yet, so the picker still works for drivers and salesmen).
const getAccounts = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: 'id,company_id,name', is_active: 'eq.true', order: 'name.asc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('expense_accounts', params).catch(() => []);
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/expenses/accounts { name, company_id? }
const createAccount = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 200);
    if (name.length < 2) return error(res, 'Account name is required', 400);
    const companyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (req.body?.company_id || req.user.company_id);
    try {
      const [row] = await pgrestPost('expense_accounts', { company_id: companyId, name });
      return success(res, row, 'Account added', 201);
    } catch (e) {
      // already there (maybe switched off earlier) -> bring it back / return it
      const existing = await pgrestGet('expense_accounts', { select: 'id,company_id,name,is_active', company_id: `eq.${companyId}`, name: `eq.${name}` }).catch(() => []);
      if (existing?.[0]) {
        if (!existing[0].is_active) await pgrestPatch('expense_accounts', { id: `eq.${existing[0].id}` }, { is_active: true });
        return success(res, { ...existing[0], is_active: true }, 'Account already exists');
      }
      return error(res, 'Could not add the account — run sql/phase71_expense_accounts.sql in Supabase first. (' + e.message + ')', 400);
    }
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/expenses/accounts/:id — switched off, not erased, so old expenses keep their name.
const deleteAccount = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const rows = await pgrestPatch('expense_accounts', filter, { is_active: false });
    if (!rows?.[0]) return error(res, 'Account not found or access denied', 404);
    return success(res, { deleted: true }, 'Account removed');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getExpenses, createExpense, deleteExpense, getAccounts, createAccount, deleteAccount, EXPENSE_CATEGORIES };
