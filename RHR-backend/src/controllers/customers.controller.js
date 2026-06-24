const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

const getCustomers = async (req, res) => {
  try {
    const user = req.user;
    let query  = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, is_approved, salesman_id, created_at')
      .eq('role', 'customer')
      .eq('is_active', true);

    // Salesman sees only his assigned customers
    if (user.role === 'salesman') {
      query = query.eq('salesman_id', user.id);
    } else {
      // Admin sees all customers in their company
      query = query.eq('company_id', user.company_id);
    }

    const { data, error: dbError } = await query.order('full_name');
    if (dbError) throw new Error(dbError.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getPendingCustomers = async (req, res) => {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, created_at')
      .eq('role', 'customer')
      .eq('is_approved', false)
      .eq('is_active', true)
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });

    if (dbError) throw new Error(dbError.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const getCustomerById = async (req, res) => {
  try {
    const user = req.user;
    let query  = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, email, is_approved, salesman_id, company_id, created_at')
      .eq('id', req.params.id)
      .eq('role', 'customer')
      .single();

    const { data, error: dbError } = await query;
    if (dbError) return error(res, 'Customer not found', 404);

    // Salesman can only view his own customers
    if (user.role === 'salesman' && data.salesman_id !== user.id) {
      return error(res, 'Access denied', 403);
    }

    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getCustomers, getPendingCustomers, getCustomerById };
