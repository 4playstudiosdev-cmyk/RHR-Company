const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

const getLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    // Customer can only see their own ledger
    if (user.role === 'customer' && customerId !== user.id)
      return error(res, 'Access denied', 403);

    // Salesman can only see ledger of his customers
    if (user.role === 'salesman') {
      const { data: customer } = await supabaseAdmin
        .from('users')
        .select('salesman_id')
        .eq('id', customerId)
        .single();
      if (!customer || customer.salesman_id !== user.id)
        return error(res, 'Access denied', 403);
    }

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

module.exports = { getLedger };
