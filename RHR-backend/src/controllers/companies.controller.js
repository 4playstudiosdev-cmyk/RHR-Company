const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

const getCompanies = async (req, res) => {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from('companies')
      .select('id, name, city, is_hq')
      .eq('is_active', true)
      .order('city');

    if (dbError) throw new Error(dbError.message);
    return success(res, data, 'Companies loaded');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { getCompanies };
