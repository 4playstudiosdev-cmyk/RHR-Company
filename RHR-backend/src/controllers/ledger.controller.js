const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { buildStatementPDF } = require('../services/statement.service');
const { buildExcelBuffer } = require('../services/excel.service');

// Shared access rule: customer sees only their own ledger, salesman only his
// customers' ledgers, admin roles see everything in their company.
const canAccessLedger = async (user, customerId) => {
  if (user.role === 'customer') return customerId === user.id;

  if (user.role === 'salesman') {
    const { data: customer } = await supabaseAdmin
      .from('users')
      .select('salesman_id')
      .eq('id', customerId)
      .single();
    return !!customer && customer.salesman_id === user.id;
  }

  return true;
};

// POST /api/v1/ledger/adjustment
// Admin manually adds a debit or credit entry — opening balance, adjustment, discount, etc.
const adjustLedger = async (req, res) => {
  try {
    const { customer_id, entry_type, amount, description } = req.body;

    if (!customer_id || !entry_type || !amount || !description)
      return error(res, 'customer_id, entry_type, amount, description are required', 400);

    if (!['debit', 'credit'].includes(entry_type))
      return error(res, 'entry_type must be debit or credit', 400);

    if (isNaN(Number(amount)) || Number(amount) <= 0)
      return error(res, 'amount must be a positive number', 400);

    // Verify the customer exists and belongs to this admin's company
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('users')
      .select('id, company_id')
      .eq('id', customer_id)
      .eq('role', 'customer')
      .single();

    if (custErr || !customer) return error(res, 'Customer not found', 404);
    if (customer.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    // Get last running balance
    const { data: last } = await supabaseAdmin
      .from('ledger_entries')
      .select('running_balance')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const prevBalance = last?.running_balance || 0;
    const newBalance  = entry_type === 'debit'
      ? prevBalance + Number(amount)
      : prevBalance - Number(amount);

    const { data, error: dbErr } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        company_id:      req.user.company_id,
        customer_id,
        entry_type,
        amount:          Number(amount),
        running_balance: newBalance,
        description,
        reference_type:  'adjustment',
        created_by:      req.user.id
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Ledger entry added', 201);
  } catch (err) { return error(res, err.message); }
};

const getLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date)   query = query.lte('created_at', to_date);

    const { data, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);

    // Current balance is the running_balance on the most recent entry
    const currentBalance = data.length > 0 ? data[0].running_balance : 0;

    return success(res, { entries: data, currentBalance });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/ledger/:customerId/statement
// Streams a PDF ledger statement for the given customer/date range
const downloadStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    const { data: customer, error: custErr } = await supabaseAdmin
      .from('users')
      .select('full_name, phone, shop_name, shop_address, company_id')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) return error(res, 'Customer not found', 404);

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, city, phone, address')
      .eq('id', customer.company_id)
      .single();

    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date)   query = query.lte('created_at', to_date);

    const { data: entries, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);

    const currentBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

    const pdfBuffer = await buildStatementPDF({
      customer, company, entries,
      fromDate: from_date, toDate: to_date, currentBalance
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${customerId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/ledger/:customerId/statement/excel
// Streams an Excel export of the ledger entries for the given date range
const downloadStatementExcel = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date)   query = query.lte('created_at', to_date);

    const { data: entries, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);

    const rows = entries.map(e => ({
      Date:        new Date(e.created_at).toLocaleDateString('en-GB'),
      Description: e.description || '',
      Type:        (e.entry_type || '').toUpperCase(),
      Amount:      e.amount,
      Balance:     e.running_balance
    }));

    const buffer = buildExcelBuffer('Statement', rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${customerId}.xlsx"`);
    return res.send(buffer);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getLedger, adjustLedger, downloadStatement, downloadStatementExcel };
