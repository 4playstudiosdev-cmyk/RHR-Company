const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/customers/pending
// Returns all unapproved customers (scoped to admin's company)
const getPendingCustomersHandler = async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, created_at, company_id')
      .eq('role', 'customer')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    // Branch admins only see their own company's pending customers
    if (req.user.role === 'branch_admin') {
      query = query.eq('company_id', req.user.company_id);
    }

    const { data, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);

    return success(res, data, 'Pending customers');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getPendingCustomersHandler };
