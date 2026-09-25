const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGetRaw, pgrestPost, pgrestDelete } = require('../utils/directQuery');

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

    // method/bank_account_id (phase24), driver_id (phase25) and
    // vehicle_id/fuel_*/bags_delivered (phase30) are separate additions —
    // fall back a level at a time if any hasn't run yet, same pattern
    // used for the other phase18 bank_account_id columns, so this never
    // breaks mid-migration.
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
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/expenses
const createExpense = async (req, res) => {
  try {
    const {
      category, amount, description, expense_date, company_id, method, bank_account_id, driver_id,
      vehicle_id, fuel_price_per_liter, fuel_liters, bags_delivered,
    } = req.body;
    if (!category || !amount || Number(amount) <= 0)
      return error(res, 'category and a positive amount are required', 400);
    if (!EXPENSE_CATEGORIES.includes(category))
      return error(res, `category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`, 400);
    if (method === 'bank' && !bank_account_id)
      return error(res, 'bank_account_id is required when method is bank', 400);

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

    // method/bank_account_id (phase24), driver_id (phase25) and
    // vehicle_id/fuel_*/bags_delivered (phase30) are separate additions —
    // fall back a level at a time if any hasn't run yet, mirroring
    // getExpenses above.
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
      return success(res, data, 'Expense recorded', 201);
    } catch (e) {
      try {
        const [data] = await pgrestPost('expenses', {
          ...baseRow,
          method: method === 'bank' ? 'bank' : 'cash',
          bank_account_id: method === 'bank' ? bank_account_id : null,
          driver_id: driver_id || null,
        });
        return success(res, data, 'Expense recorded', 201);
      } catch (e2) {
        try {
          const [data] = await pgrestPost('expenses', {
            ...baseRow,
            method: method === 'bank' ? 'bank' : 'cash',
            bank_account_id: method === 'bank' ? bank_account_id : null,
          });
          return success(res, data, 'Expense recorded', 201);
        } catch (e3) {
          const [data] = await pgrestPost('expenses', baseRow);
          return success(res, data, 'Expense recorded', 201);
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

module.exports = { getExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES };
