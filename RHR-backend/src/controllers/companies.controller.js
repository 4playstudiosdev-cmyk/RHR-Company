const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/companies
// Public — needed during customer registration to pick a branch
const getCompaniesHandler = async (req, res) => {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from('companies')
      .select('id, name, city')
      .order('name', { ascending: true });

    if (dbError) throw new Error(dbError.message);

    return success(res, data, 'Companies');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getCompaniesHandler };
