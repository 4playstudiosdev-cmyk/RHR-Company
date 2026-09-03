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

// Shared by POST /produce and the production-order "Start Production" step
// below — logs one production run: deducts raw materials per the matched
// recipe (production_bom), credits the finished product, records the run.
// Throws Error with .statusCode set for expected failures (no recipe,
// insufficient stock) so callers can map them to the right HTTP status.
const runProduction = async ({ companyId, userId, recipeId, qtyProduced, date, remarks }) => {
  const { data: bomRecipe } = await supabaseAdmin
    .from('production_bom')
    .select(`
      *,
      production_bom_items(
        id, qty_required, unit, raw_material_id,
        raw_materials(id, name, stock, unit)
      )
    `)
    .eq('id', recipeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!bomRecipe) {
    throw Object.assign(new Error(
      'No recipe configured for this product. Create a recipe first under Production → Recipes before logging production.'
    ), { statusCode: 404 });
  }

  const { data: matchedProduct } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .ilike('name', bomRecipe.product_name)
    .maybeSingle();

  if (!matchedProduct) {
    throw Object.assign(new Error(
      `No product named "${bomRecipe.product_name}" found in the catalog — add it under Products first (name must match exactly) so production can credit its stock.`
    ), { statusCode: 400 });
  }

  const allIngredients = (bomRecipe.production_bom_items || []).map(i => ({
    quantity: i.qty_required,
    unit: i.unit,
    raw_material_id: i.raw_material_id,
    rate_per_unit: 0,
    raw_materials: i.raw_materials,
  }));
  const finishedProductId = matchedProduct.id;
  const recipeLabel = bomRecipe.product_name;
  const batchUnit = bomRecipe.batch_unit;

  const materialNeeds = allIngredients.map(ing => {
    const needed = Number(ing.quantity) * Number(qtyProduced);
    const available = Number(ing.raw_materials?.stock || 0);
    return {
      raw_material_id: ing.raw_material_id,
      name:            ing.raw_materials?.name,
      unit:            ing.unit,
      needed,
      available,
      shortage:        Math.max(0, needed - available),
      canProduce:      available >= needed,
    };
  });

  const insufficient = materialNeeds.filter(m => !m.canProduce);
  if (insufficient.length > 0) {
    throw Object.assign(new Error('Insufficient raw materials: ' +
      insufficient.map(m => `${m.name} (need ${m.needed} ${m.unit}, have ${m.available})`).join(', ')
    ), { statusCode: 400 });
  }

  const totalCost = allIngredients.reduce(
    (sum, ing) => sum + Number(ing.rate_per_unit || 0) * Number(ing.quantity) * Number(qtyProduced),
    0
  );

  const { data: newProduction, error: pErr } = await supabaseAdmin
    .from('productions')
    .insert({
      company_id:       companyId,
      recipe_id:        recipeId,
      finished_item_id: finishedProductId,
      date:             date || new Date().toISOString().split('T')[0],
      qty_produced:     Number(qtyProduced),
      remarks:          remarks || null,
      created_by:       userId,
      total_cost:       Number(totalCost.toFixed(2)),
    })
    .select()
    .single();

  if (pErr) throw new Error(pErr.message);

  for (const mat of materialNeeds) {
    await supabaseAdmin
      .from('production_lines')
      .insert({
        production_id:   newProduction.id,
        raw_material_id: mat.raw_material_id,
        qty_used:        mat.needed,
        unit:            mat.unit,
      });

    const { data: current } = await supabaseAdmin
      .from('raw_materials')
      .select('stock')
      .eq('id', mat.raw_material_id)
      .single();

    await supabaseAdmin
      .from('raw_materials')
      .update({ stock: Number(current.stock) - mat.needed })
      .eq('id', mat.raw_material_id);

    await supabaseAdmin
      .from('raw_material_stock_logs')
      .insert({
        material_id: mat.raw_material_id,
        company_id:  companyId,
        quantity:    -mat.needed,
        logged_date: date || new Date().toISOString().split('T')[0],
        created_by:  userId,
        note: `Used in production: ${recipeLabel} — ${qtyProduced} ${batchUnit} (production ${newProduction.id})`,
      });
  }

  const { data: finishedProduct } = await supabaseAdmin
    .from('products')
    .select('stock_quantity')
    .eq('id', finishedProductId)
    .single();

  await supabaseAdmin
    .from('products')
    .update({ stock_quantity: Number(finishedProduct.stock_quantity) + Number(qtyProduced) })
    .eq('id', finishedProductId);

  return {
    production_id:  newProduction.id,
    recipe_name:    recipeLabel,
    qty_produced:   Number(qtyProduced),
    batch_unit:     batchUnit,
    total_cost:     Number(totalCost.toFixed(2)),
    materials_used: materialNeeds.map(m => ({ name: m.name, qty_used: m.needed, unit: m.unit })),
  };
};

// PATCH /api/v1/production/orders/:id/status
const updateProductionOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'in_production', 'ready', 'dispatched'];
    if (!valid.includes(status))
      return error(res, `status must be one of: ${valid.join(', ')}`, 400);

    const { data: order, error: findErr } = await supabaseAdmin
      .from('production_orders')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
    if (findErr || !order) return error(res, 'Production order not found', 404);

    let productionResult = null;

    // Starting production is the point materials actually get consumed —
    // match the order's product to a Production → Recipes entry and run
    // the same stock-deduction logic /produce uses, scaled to order.qty.
    if (status === 'in_production' && order.status === 'pending') {
      const { data: recipe } = await supabaseAdmin
        .from('production_bom')
        .select('id')
        .eq('company_id', req.user.company_id)
        .eq('is_active', true)
        .ilike('product_name', order.product_name)
        .maybeSingle();

      if (!recipe) {
        return error(res,
          `No recipe configured for "${order.product_name}" — create one under Production → Recipes before starting this order.`,
          400
        );
      }

      try {
        productionResult = await runProduction({
          companyId:   req.user.company_id,
          userId:      req.user.id,
          recipeId:    recipe.id,
          qtyProduced: order.qty,
          date:        new Date().toISOString().split('T')[0],
          remarks:     `Auto-logged from production order ${order.order_number}`,
        });
      } catch (prodErr) {
        return error(res, prodErr.message, prodErr.statusCode || 500);
      }
    }

    const { data, error: dbErr } = await supabaseAdmin
      .from('production_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, { ...data, production: productionResult }, `Order marked ${status}`);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getProductionDemand, getProductionOrders, createProductionOrder, updateProductionOrderStatus, runProduction };
