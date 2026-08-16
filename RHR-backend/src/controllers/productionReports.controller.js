const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/production/reports/daily
// Derived from production_orders.start_date — there's no separate
// production-floor log yet, so "daily production" is a proxy: how much
// was scheduled to start on each day, not verified floor output.
const getDailyReport = async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data, error: dbErr } = await supabaseAdmin
      .from('production_orders')
      .select('start_date, product_name, qty, unit')
      .eq('company_id', req.user.company_id)
      .gte('start_date', since.toISOString().split('T')[0])
      .order('start_date', { ascending: true });
    if (dbErr) throw new Error(dbErr.message);

    const byDate = {};
    (data || []).forEach((r) => {
      byDate[r.start_date] = (byDate[r.start_date] || 0) + Number(r.qty);
    });
    const series = Object.entries(byDate).map(([date, qty]) => ({ date, qty }));

    return success(res, { series, records: data || [] }, 'Daily production report');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/production/reports/consumption
// No recipe/BOM system exists yet (see the "Recipes TBD" note on the
// dashboard), so real material consumption can't be derived from
// production activity. Returns current stock with `available: false`
// so the frontend shows an honest empty state instead of fake trends.
const getConsumptionReport = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('raw_materials')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('name');
    if (dbErr) throw new Error(dbErr.message);

    return success(
      res,
      { available: false, materials: data || [] },
      'Consumption tracking requires product recipes, which are not configured yet'
    );
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/production/reports/stock
const getStockReport = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('raw_materials')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data || [], 'Stock status report');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getDailyReport, getConsumptionReport, getStockReport };
