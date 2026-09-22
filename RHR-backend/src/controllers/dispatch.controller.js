const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/production/dispatch
// Routed through the raw-https bypass (see utils/directQuery.js) — same
// class of Railway/supabase-js flakiness fixed for salesmen/drivers/
// production_orders reads. drivers(...) needs dispatches.driver_id (a
// phase19 addition) — falls back to the plain select if that migration
// hasn't run yet, so the page still works without joined driver details.
const getDispatches = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: '*,drivers(id,full_name,car_number,phone)',
      order: 'dispatched_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    let data;
    try {
      data = await pgrestGet('dispatches', params);
    } catch (e) {
      const { select, ...fallbackParams } = params;
      data = await pgrestGet('dispatches', { ...fallbackParams, select: '*' });
    }
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/production/dispatch — only a production order marked
// "ready" can be dispatched. Creates the dispatch record and flips the
// production order to "dispatched". driver_id is optional (a phase19
// addition) — when given, the driver's name is still denormalized into
// the legacy `driver` text column too, so existing display code and
// exports that read it directly keep working either way.
const createDispatch = async (req, res) => {
  try {
    const { production_order_id, destination, driver, driver_id, notes } = req.body;
    if (!production_order_id || !destination)
      return error(res, 'production_order_id and destination are required', 400);

    let driverName = driver || null;
    if (driver_id) {
      const drivers = await pgrestGet('drivers', {
        select: 'id,full_name',
        id: `eq.${driver_id}`,
        company_id: `eq.${req.user.company_id}`,
      });
      const matched = drivers?.[0];
      if (!matched) return error(res, 'Driver not found in this branch', 404);
      driverName = matched.full_name;
    }
    if (!driverName) return error(res, 'driver_id or driver is required', 400);

    const orders = await pgrestGet('production_orders', {
      select: '*',
      id: `eq.${production_order_id}`,
      company_id: `eq.${req.user.company_id}`,
    });
    const order = orders?.[0];
    if (!order) return error(res, 'Production order not found', 404);
    if (order.status !== 'ready')
      return error(res, 'Only production orders marked Ready can be dispatched', 400);

    const datePart = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const dispatchNumber = `DSP-${datePart}-${randPart}`;

    const dispatchRow = {
      company_id:          req.user.company_id,
      dispatch_number:     dispatchNumber,
      production_order_id,
      product_name:        order.product_name,
      unit:                order.unit,
      qty:                 order.qty,
      destination,
      driver:              driverName,
      notes:               notes || null,
      status:              'in_transit',
      created_by:          req.user.id
    };
    let data;
    try {
      [data] = await pgrestPost('dispatches', { ...dispatchRow, driver_id: driver_id || null });
    } catch (e) {
      [data] = await pgrestPost('dispatches', dispatchRow);
    }

    await pgrestPatch(
      'production_orders',
      { id: `eq.${production_order_id}` },
      { status: 'dispatched', updated_at: new Date().toISOString() }
    );

    return success(res, data, 'Dispatched', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/production/dispatch/:id/deliver
const markDelivered = async (req, res) => {
  try {
    const data = await pgrestPatch(
      'dispatches',
      { id: `eq.${req.params.id}`, company_id: `eq.${req.user.company_id}` },
      { status: 'delivered', delivered_at: new Date().toISOString() }
    );
    if (!data?.[0]) return error(res, 'Dispatch record not found', 404);
    return success(res, data[0], 'Marked delivered');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getDispatches, createDispatch, markDelivered };
