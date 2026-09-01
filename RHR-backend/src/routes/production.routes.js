const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { retryIfEmpty } = require('../utils/withRetry');

const production = require('../controllers/production.controller');
const materials   = require('../controllers/rawMaterials.controller');
const dispatch    = require('../controllers/dispatch.controller');
const reports      = require('../controllers/productionReports.controller');

router.get('/demand',              authenticate, isAdmin, production.getProductionDemand);
router.get('/orders',              authenticate, isAdmin, production.getProductionOrders);
router.post('/orders',             authenticate, isAdmin, production.createProductionOrder);
router.patch('/orders/:id/status', authenticate, isAdmin, production.updateProductionOrderStatus);

router.get('/materials',           authenticate, isAdmin, materials.getMaterials);
router.post('/materials',          authenticate, isAdmin, materials.createMaterial);
router.patch('/materials/:id/stock', authenticate, isAdmin, materials.addStock);

// ─────────────────────────────────────
// Production section's own BOM list (production_bom/production_bom_items
// — see sql/phase13_production_bom.sql). Deliberately separate from
// /api/v1/recipes (production_recipes/recipe_ingredients, used by the
// top-level Recipes page) — this one is keyed by a free-text product
// name instead of a real products.id, and is a reference BOM only, not
// wired into /production/produce's stock-deduction flow.
// ─────────────────────────────────────

// GET /api/v1/production/recipes
router.get('/recipes', authenticate, isAdmin, async (req, res) => {
  try {
    const data = await retryIfEmpty(async () => {
      const { data, error: dbErr } = await supabaseAdmin
        .from('production_bom')
        .select(`
          *,
          recipe_ingredients:production_bom_items(
            id, qty_required, unit,
            raw_materials(id, name, unit)
          )
        `)
        .eq('company_id', req.user.company_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (dbErr) throw new Error(dbErr.message);
      return data;
    }, 6, 600);

    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/production/recipes
router.post('/recipes', authenticate, isAdmin, async (req, res) => {
  try {
    const { recipe_name, product_name, batch_size, batch_unit, ingredients } = req.body;
    const name = (product_name || recipe_name || '').trim();

    if (!name || !ingredients?.length)
      return error(res, 'product_name and ingredients are required', 400);
    if (ingredients.some(i => !i.raw_material_id || !i.qty_required))
      return error(res, 'Every ingredient needs a raw material and quantity', 400);

    const { data: bom, error: bErr } = await supabaseAdmin
      .from('production_bom')
      .insert({
        company_id:   req.user.company_id,
        product_name: name,
        batch_size:   batch_size || 1,
        batch_unit:   batch_unit || 'bag',
      })
      .select()
      .single();

    if (bErr) throw new Error(bErr.message);

    const rows = ingredients.map(i => ({
      bom_id:           bom.id,
      raw_material_id:  i.raw_material_id,
      qty_required:     Number(i.qty_required),
      unit:             i.unit,
    }));

    const { error: iErr } = await supabaseAdmin.from('production_bom_items').insert(rows);
    if (iErr) throw new Error(iErr.message);

    return success(res, bom, 'Recipe saved', 201);
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/production/recipes/:id
router.delete('/recipes/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { error: dbErr } = await supabaseAdmin
      .from('production_bom')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);

    if (dbErr) throw new Error(dbErr.message);
    return success(res, { deleted: true }, 'Recipe deleted');
  } catch (err) { return error(res, err.message); }
});

router.get('/dispatch',            authenticate, isAdmin, dispatch.getDispatches);
router.post('/dispatch',           authenticate, isAdmin, dispatch.createDispatch);
router.patch('/dispatch/:id/deliver', authenticate, isAdmin, dispatch.markDelivered);

router.get('/reports/daily',       authenticate, isAdmin, reports.getDailyReport);
router.get('/reports/consumption', authenticate, isAdmin, reports.getConsumptionReport);
router.get('/reports/stock',       authenticate, isAdmin, reports.getStockReport);

// ─────────────────────────────────────
// GET /api/v1/production/history
// All production runs for this company
// ─────────────────────────────────────
router.get('/history', authenticate, isAdmin, async (req, res) => {
  try {
    // Same embedded-resource-join flakiness as GET /recipes — see the
    // comment there and in utils/withRetry.js.
    const data = await retryIfEmpty(async () => {
      const { data, error: dbErr } = await supabaseAdmin
        .from('productions')
        .select(`
          *,
          production_lines(
            id, qty_used, unit,
            raw_materials(id, name, unit)
          ),
          products!finished_item_id(id, name, unit),
          production_recipes(id, recipe_name, batch_size, batch_unit)
        `)
        .eq('company_id', req.user.company_id)
        .order('created_at', { ascending: false });
      if (dbErr) throw new Error(dbErr.message);
      return data;
    }, 6, 600);

    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// ─────────────────────────────────────
// POST /api/v1/production/produce
// Log new production batch — deducts raw material stock automatically
// ─────────────────────────────────────
router.post('/produce', authenticate, isAdmin, async (req, res) => {
  try {
    const { recipe_id, qty_produced, date, remarks } = req.body;

    if (!recipe_id || !qty_produced)
      return error(res, 'recipe_id and qty_produced are required', 400);

    // Step 1 — Get recipe with ingredients (raw_material_id links a
    // material line to a real raw_materials row — see phase12 migration.
    // A NULL raw_material_id is a cost-only line — Labor, FBR Tax,
    // Wastage, etc. — it contributes to cost but never touches stock).
    const { data: recipe, error: rErr } = await supabaseAdmin
      .from('production_recipes')
      .select(`
        *,
        recipe_ingredients(
          id, quantity, unit, raw_material_id, ingredient_name, rate_per_unit,
          raw_materials(id, name, stock, unit)
        )
      `)
      .eq('id', recipe_id)
      .eq('company_id', req.user.company_id)
      .single();

    if (rErr || !recipe) return error(res, 'Recipe not found', 404);

    const allIngredients = recipe.recipe_ingredients || [];
    const materialIngredients = allIngredients.filter(ing => ing.raw_material_id);
    const costOnlyIngredients = allIngredients.filter(ing => !ing.raw_material_id);

    // Step 2 — Calculate qty needed per material ingredient
    // Formula: qty_needed = quantity (per 1 unit of recipe) * qty_produced
    const materialNeeds = materialIngredients.map(ing => {
      const needed = Number(ing.quantity) * Number(qty_produced);
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

    // Step 3 — Check if all materials available
    const insufficient = materialNeeds.filter(m => !m.canProduce);
    if (insufficient.length > 0) {
      return error(res, 'Insufficient raw materials: ' +
        insufficient.map(m => `${m.name} (need ${m.needed} ${m.unit}, have ${m.available})`).join(', '),
        400
      );
    }

    // Step 4 — Create production record. total_cost scales every line
    // (materials and cost-only alike) by qty_produced, same as the
    // material-needed calculation above.
    const totalCost = allIngredients.reduce(
      (sum, ing) => sum + Number(ing.rate_per_unit || 0) * Number(ing.quantity) * Number(qty_produced),
      0
    );

    const { data: newProduction, error: pErr } = await supabaseAdmin
      .from('productions')
      .insert({
        company_id:       req.user.company_id,
        recipe_id,
        finished_item_id: recipe.product_id,
        date:             date || new Date().toISOString().split('T')[0],
        qty_produced:     Number(qty_produced),
        remarks:          remarks || null,
        created_by:       req.user.id,
        total_cost:       Number(totalCost.toFixed(2)),
      })
      .select()
      .single();

    if (pErr) throw new Error(pErr.message);

    // Step 5 — Insert production lines + deduct raw material stock
    for (const mat of materialNeeds) {
      // Insert production line (log what was used)
      await supabaseAdmin
        .from('production_lines')
        .insert({
          production_id:   newProduction.id,
          raw_material_id: mat.raw_material_id,
          qty_used:        mat.needed,
          unit:            mat.unit,
        });

      // Deduct from raw_materials stock
      const { data: current } = await supabaseAdmin
        .from('raw_materials')
        .select('stock')
        .eq('id', mat.raw_material_id)
        .single();

      await supabaseAdmin
        .from('raw_materials')
        .update({
          stock: Number(current.stock) - mat.needed
        })
        .eq('id', mat.raw_material_id);

      // Log stock movement (no dedicated movement_type/reference columns
      // on this table — folded into the note text instead)
      await supabaseAdmin
        .from('raw_material_stock_logs')
        .insert({
          material_id: mat.raw_material_id,
          company_id:  req.user.company_id,
          quantity:    -mat.needed,
          logged_date: date || new Date().toISOString().split('T')[0],
          created_by:  req.user.id,
          note: `Used in production: ${recipe.recipe_name} — ${qty_produced} ${recipe.batch_unit} (production ${newProduction.id})`,
        });
    }

    // Step 6 — Add finished product to products stock
    const { data: finishedProduct } = await supabaseAdmin
      .from('products')
      .select('stock_quantity')
      .eq('id', recipe.product_id)
      .single();

    await supabaseAdmin
      .from('products')
      .update({
        stock_quantity: Number(finishedProduct.stock_quantity) + Number(qty_produced)
      })
      .eq('id', recipe.product_id);

    return success(res, {
      production_id:  newProduction.id,
      recipe_name:    recipe.recipe_name,
      qty_produced:   Number(qty_produced),
      total_cost:     Number(totalCost.toFixed(2)),
      materials_used: materialNeeds.map(m => ({
        name:     m.name,
        qty_used: m.needed,
        unit:     m.unit
      })),
      other_costs: costOnlyIngredients.map(c => ({
        name: c.ingredient_name,
        amount: Number((Number(c.rate_per_unit || 0) * Number(c.quantity) * Number(qty_produced)).toFixed(2))
      }))
    }, `Production logged — ${qty_produced} ${recipe.batch_unit} produced, raw materials deducted`, 201);

  } catch (err) { return error(res, err.message); }
});

// ─────────────────────────────────────
// DELETE /api/v1/production/runs/:id
// Revert a production run — restores raw material stock
// ─────────────────────────────────────
router.delete('/runs/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get production record
    const { data: productionRun, error: pErr } = await supabaseAdmin
      .from('productions')
      .select(`
        *,
        production_lines(id, qty_used, unit, raw_material_id)
      `)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .single();

    if (pErr || !productionRun) return error(res, 'Production record not found', 404);

    // Restore raw material stock for each line
    for (const line of productionRun.production_lines) {
      const { data: current } = await supabaseAdmin
        .from('raw_materials')
        .select('stock')
        .eq('id', line.raw_material_id)
        .single();

      await supabaseAdmin
        .from('raw_materials')
        .update({
          stock: Number(current.stock) + Number(line.qty_used)
        })
        .eq('id', line.raw_material_id);

      // Log reversal
      await supabaseAdmin
        .from('raw_material_stock_logs')
        .insert({
          material_id: line.raw_material_id,
          company_id:  req.user.company_id,
          quantity:    Number(line.qty_used),
          logged_date: new Date().toISOString().split('T')[0],
          created_by:  req.user.id,
          note: `Reverted production run ${id}`,
        });
    }

    // Deduct finished product stock
    const { data: finishedProduct } = await supabaseAdmin
      .from('products')
      .select('stock_quantity')
      .eq('id', productionRun.finished_item_id)
      .single();

    await supabaseAdmin
      .from('products')
      .update({
        stock_quantity: Math.max(0,
          Number(finishedProduct.stock_quantity) - Number(productionRun.qty_produced)
        )
      })
      .eq('id', productionRun.finished_item_id);

    // Delete production lines, then the production record itself (no
    // ON DELETE CASCADE confirmed on this FK, so remove lines explicitly
    // first rather than risk an orphaned-row failure on the parent delete)
    await supabaseAdmin
      .from('production_lines')
      .delete()
      .eq('production_id', id);

    await supabaseAdmin
      .from('productions')
      .delete()
      .eq('id', id);

    return success(res, { reverted: true },
      'Production reverted — raw material stock restored');

  } catch (err) { return error(res, err.message); }
});

module.exports = router;
