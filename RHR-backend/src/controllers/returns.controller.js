const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/returns/materials?type=packaging|raw_material&company_id=
const getMaterialReturns = async (req, res) => {
  try {
    const { type } = req.query;
    if (!['packaging', 'raw_material'].includes(type))
      return error(res, 'type must be packaging or raw_material', 400);

    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,quantity,notes,created_at,raw_materials(name,unit,category)',
      return_type: `eq.${type}`,
      order: 'created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('material_returns', params);
    return success(res, data);
  } catch (err) {
    // material_returns is a phase22 addition.
    return success(res, []);
  }
};

// POST /api/v1/returns/materials — packaging/raw material physically
// coming back to the company. Adds to raw_materials.stock and logs to
// raw_material_stock_logs, same as the "+ Add Stock" flow on Raw
// Materials, plus its own material_returns record for the Returns panel.
const createMaterialReturn = async (req, res) => {
  try {
    const { return_type, raw_material_id, quantity, notes } = req.body;
    if (!['packaging', 'raw_material'].includes(return_type))
      return error(res, 'return_type must be packaging or raw_material', 400);
    if (!raw_material_id || !quantity || Number(quantity) <= 0)
      return error(res, 'raw_material_id and a positive quantity are required', 400);

    const filter = { id: `eq.${raw_material_id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const materials = await pgrestGet('raw_materials', { select: 'id,name,unit,stock,company_id', ...filter });
    const material = materials?.[0];
    if (!material) return error(res, 'Material not found or access denied', 404);

    // material_returns first (fails immediately if phase22 hasn't run) —
    // deliberately before the stock/log mutations below, so a request
    // that errors out never silently increases stock with no record of
    // the return that caused it.
    const [data] = await pgrestPost('material_returns', {
      company_id: material.company_id,
      return_type,
      raw_material_id,
      quantity: Number(quantity),
      notes: notes || null,
      created_by: req.user.id,
    });

    await pgrestPatch('raw_materials', { id: `eq.${raw_material_id}` }, {
      stock: Number(material.stock) + Number(quantity),
    });

    await pgrestPost('raw_material_stock_logs', {
      material_id: raw_material_id,
      company_id: material.company_id,
      quantity: Number(quantity),
      note: `Returned (${return_type === 'packaging' ? 'packaging' : 'raw material'})${notes ? ' — ' + notes : ''}`,
      logged_date: new Date().toISOString().split('T')[0],
      created_by: req.user.id,
    });

    return success(res, { ...data, material_name: material.name, unit: material.unit }, 'Return recorded — stock updated', 201);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/returns/orders?company_id=
const getOrderReturns = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,order_id,amount_total,amount_returned,notes,created_at,orders(order_number),users:customer_id(full_name)',
      order: 'created_at.desc',
    };
    if (req.query.order_id) {
      params.order_id = `eq.${req.query.order_id}`;
    } else if (companyId) {
      params.company_id = `eq.${companyId}`;
    }

    const data = await pgrestGet('order_returns', params);
    return success(res, data);
  } catch (err) {
    return success(res, []);
  }
};

// POST /api/v1/returns/orders — order_id + amount_returned. Credits the
// customer's ledger for the returned amount (a credit lowers what they
// owe, same as an approved payment) and records the return. The frontend
// then downloads an "updated invoice" reflecting order total minus this
// return — see Orders.js buildInvoicePdf.
const createOrderReturn = async (req, res) => {
  try {
    const { order_id, amount_returned, notes } = req.body;
    if (!order_id || !amount_returned || Number(amount_returned) <= 0)
      return error(res, 'order_id and a positive amount_returned are required', 400);

    const filter = { id: `eq.${order_id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const orders = await pgrestGet('orders', { select: 'id,order_number,customer_id,company_id,total_amount', ...filter });
    const order = orders?.[0];
    if (!order) return error(res, 'Order not found or access denied', 404);

    if (Number(amount_returned) > Number(order.total_amount))
      return error(res, 'Return amount cannot exceed the order total', 400);

    // order_returns first (fails immediately if phase22 hasn't run) —
    // deliberately before the ledger credit below, so a request that
    // errors out never silently credits the customer's ledger with no
    // record of the return that caused it.
    const [data] = await pgrestPost('order_returns', {
      company_id: order.company_id,
      order_id: order.id,
      customer_id: order.customer_id,
      amount_total: Number(order.total_amount),
      amount_returned: Number(amount_returned),
      notes: notes || null,
      created_by: req.user.id,
    });

    // Ledger credit — same running-balance computation as POST
    // /ledger/adjustment, done directly here rather than an internal
    // HTTP call.
    const lastEntries = await pgrestGet('ledger_entries', {
      select: 'running_balance',
      customer_id: `eq.${order.customer_id}`,
      order: 'created_at.desc',
      limit: '1',
    });
    const prevBalance = lastEntries?.[0]?.running_balance || 0;
    const newBalance = prevBalance - Number(amount_returned);

    await pgrestPost('ledger_entries', {
      company_id: order.company_id,
      customer_id: order.customer_id,
      entry_type: 'credit',
      amount: Number(amount_returned),
      running_balance: newBalance,
      description: `Return — Order #${order.order_number}`,
      reference_type: 'return',
      created_by: req.user.id,
    });

    return success(res, { ...data, order_number: order.order_number }, 'Return recorded — customer ledger updated', 201);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getMaterialReturns, createMaterialReturn, getOrderReturns, createOrderReturn };
