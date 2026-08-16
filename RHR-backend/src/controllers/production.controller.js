const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// Orders that still need product manufactured/shipped for them. The task
// spec says "pending customer orders" — but literally filtering to
// status='pending' misses orders already accepted (confirmed/preparing)
// that still haven't been dispatched, which is what production actually
// cares about, so this counts anything short of dispatched/delivered/cancelled.
const OUTSTANDING_STATUSES = ['pending', 'confirmed', 'preparing'];

// GET /api/v1/production/demand
const getProductionDemand = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const { data: orders, error: ordersErr } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('company_id', companyId)
      .in('status', OUTSTANDING_STATUSES);
    if (ordersErr) throw new Error(ordersErr.message);

    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length === 0) return success(res, [], 'No outstanding production demand');

    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .select('product_name, quantity, products(unit, categories(name))')
      .in('order_id', orderIds);
    if (itemsErr) throw new Error(itemsErr.message);

    // category name -> product name -> { qty, unit }
    const categoryMap = new Map();
    for (const item of items || []) {
      const categoryName = item.products?.categories?.name || 'Uncategorized';
      const unit = item.products?.unit || 'units';
      if (!categoryMap.has(categoryName)) categoryMap.set(categoryName, new Map());
      const productMap = categoryMap.get(categoryName);
      const existing = productMap.get(item.product_name) || { qty: 0, unit };
      existing.qty += Number(item.quantity);
      productMap.set(item.product_name, existing);
    }

    const demand = Array.from(categoryMap.entries()).map(([category, productMap]) => ({
      category,
      items: Array.from(productMap.entries()).map(([product, { qty, unit }]) => ({ product, qty, unit }))
    }));

    return success(res, demand, 'Production demand');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/production/orders
const getProductionOrders = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('production_orders')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/production/orders
const createProductionOrder = async (req, res) => {
  try {
    const { product_id, qty, batches, priority, notes, start_date } = req.body;
    if (!product_id || !qty) return error(res, 'product_id and qty are required', 400);

    const { data: product, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('name, unit')
      .eq('id', product_id)
      .eq('company_id', req.user.company_id)
      .single();
    if (prodErr || !product) return error(res, 'Product not found', 404);

    const datePart = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `PRD-${datePart}-${randPart}`;

    const { data, error: dbErr } = await supabaseAdmin
      .from('production_orders')
      .insert({
        company_id:   req.user.company_id,
        order_number: orderNumber,
        product_id,
        product_name: product.name,
        unit:         product.unit || 'units',
        qty:          Number(qty),
        batches:      Number(batches) || 1,
        priority:     priority === 'urgent' ? 'urgent' : 'normal',
        notes:        notes || null,
        start_date:   start_date || new Date().toISOString().split('T')[0],
        status:       'pending',
        created_by:   req.user.id
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Production order created', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/production/orders/:id/status
const updateProductionOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'in_production', 'ready', 'dispatched'];
    if (!valid.includes(status))
      return error(res, `status must be one of: ${valid.join(', ')}`, 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('production_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, `Order marked ${status}`);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getProductionDemand, getProductionOrders, createProductionOrder, updateProductionOrderStatus };
