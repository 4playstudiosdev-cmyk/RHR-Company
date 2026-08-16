const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/production/dispatch
const getDispatches = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('dispatches')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('dispatched_at', { ascending: false });
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/production/dispatch
// Only a production order marked "ready" can be dispatched. Creates the
// dispatch record and flips the production order to "dispatched".
const createDispatch = async (req, res) => {
  try {
    const { production_order_id, destination, driver, notes } = req.body;
    if (!production_order_id || !destination || !driver)
      return error(res, 'production_order_id, destination, driver are required', 400);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('production_orders')
      .select('*')
      .eq('id', production_order_id)
      .eq('company_id', req.user.company_id)
      .single();
    if (orderErr || !order) return error(res, 'Production order not found', 404);
    if (order.status !== 'ready')
      return error(res, 'Only production orders marked Ready can be dispatched', 400);

    const datePart = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const dispatchNumber = `DSP-${datePart}-${randPart}`;

    const { data, error: dbErr } = await supabaseAdmin
      .from('dispatches')
      .insert({
        company_id:          req.user.company_id,
        dispatch_number:     dispatchNumber,
        production_order_id,
        product_name:        order.product_name,
        unit:                order.unit,
        qty:                 order.qty,
        destination,
        driver,
        notes:               notes || null,
        status:              'in_transit',
        created_by:          req.user.id
      })
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);

    await supabaseAdmin
      .from('production_orders')
      .update({ status: 'dispatched', updated_at: new Date().toISOString() })
      .eq('id', production_order_id);

    return success(res, data, 'Dispatched', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/production/dispatch/:id/deliver
const markDelivered = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('dispatches')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Marked delivered');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getDispatches, createDispatch, markDelivered };
