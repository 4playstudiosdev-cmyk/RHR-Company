const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { retryIfEmpty } = require('../utils/withRetry');

// GET /api/v1/recipes
// Returns all recipes with ingredients for this company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    // This embedded-resource query (long select= string, two nested
    // joins) is the one most exposed to a Railway<->Supabase blip that
    // comes back as a *successful but wrongly-empty* result rather than
    // a thrown error — retryIfEmpty re-runs it once rather than trusting
    // a first empty response outright.
    const data = await retryIfEmpty(async () => {
      const { data, error: dbErr } = await supabaseAdmin
        .from('production_recipes')
        .select(`
          *,
          recipe_ingredients(
            id, quantity, unit, raw_material_id, ingredient_name, rate_per_unit, total_cost,
            raw_materials(id, name, unit, stock)
          ),
          products!product_id(id, name, unit, stock_quantity)
        `)
        .eq('company_id', req.user.company_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (dbErr) throw new Error(dbErr.message);
      return data;
    }, 4, 350);

    // total_cost per recipe isn't stored (it'd need to stay in sync with
    // every ingredient edit) — just sum the line items on the way out.
    const withTotals = (data || []).map(r => ({
      ...r,
      recipe_total_cost: (r.recipe_ingredients || [])
        .reduce((sum, i) => sum + Number(i.total_cost || 0), 0)
    }));

    return success(res, withTotals);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/recipes
// Create new recipe with ingredients
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const {
      recipe_name,
      finished_item_id, // maps to production_recipes.product_id
      batch_size,
      batch_unit,
      notes,
      // array of two kinds of line, told apart by whether raw_material_id
      // is set:
      //   material line: { raw_material_id, qty_required, unit, rate_per_unit? }
      //     — deducts raw_materials stock when produced
      //   cost-only line: { raw_material_id: null, ingredient_name, qty_required, unit, rate_per_unit }
      //     — e.g. Labor, FBR Tax, Wastage — contributes to recipe cost
      //     only, never touches stock
      ingredients
    } = req.body;

    if (!recipe_name || !finished_item_id || !ingredients?.length)
      return error(res, 'recipe_name, finished_item_id, ingredients are required', 400);

    if (ingredients.some(i => !i.raw_material_id && !i.ingredient_name)) {
      return error(res, 'Every ingredient needs either a raw material or a cost label', 400);
    }

    // Create recipe
    const { data: recipe, error: rErr } = await supabaseAdmin
      .from('production_recipes')
      .insert({
        company_id:  req.user.company_id,
        product_id:  finished_item_id,
        recipe_name,
        batch_size:  batch_size  || 1,
        batch_unit:  batch_unit  || 'bag',
        notes:       notes       || null,
      })
      .select()
      .single();

    if (rErr) throw new Error(rErr.message);

    // Look up names for the denormalized ingredient_name column on
    // material lines (kept alongside raw_material_id — some older
    // reporting queries may still read it, and it's a harmless free
    // display copy). Cost-only lines already carry their own label.
    const materialIds = ingredients.map(i => i.raw_material_id).filter(Boolean);
    const { data: materials } = await supabaseAdmin
      .from('raw_materials')
      .select('id, name')
      .in('id', materialIds.length ? materialIds : ['00000000-0000-0000-0000-000000000000']);
    const nameById = Object.fromEntries((materials || []).map(m => [m.id, m.name]));

    // Insert ingredients
    const rows = ingredients.map(i => {
      const qty  = Number(i.qty_required) || 0;
      const rate = Number(i.rate_per_unit) || 0;
      return {
        recipe_id:       recipe.id,
        raw_material_id: i.raw_material_id || null,
        ingredient_name: i.raw_material_id ? (nameById[i.raw_material_id] || null) : i.ingredient_name,
        quantity:        qty,
        unit:            i.unit,
        rate_per_unit:   rate,
        total_cost:      Number((qty * rate).toFixed(2)),
      };
    });

    const { error: iErr } = await supabaseAdmin
      .from('recipe_ingredients')
      .insert(rows);

    if (iErr) throw new Error(iErr.message);

    return success(res, recipe, 'Recipe created successfully', 201);
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/recipes/:id
// Soft delete recipe
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { error: dbErr } = await supabaseAdmin
      .from('production_recipes')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);

    if (dbErr) throw new Error(dbErr.message);
    return success(res, { deleted: true }, 'Recipe deleted');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recipes/finished-products
// Get all finished products for dropdown
router.get('/finished-products', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('products')
      .select('id, name, unit, stock_quantity')
      .eq('company_id', req.user.company_id)
      .eq('is_active', true)
      .order('name');

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/recipes/raw-materials
// Get all raw materials for ingredient dropdown
router.get('/raw-materials', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('raw_materials')
      .select('id, name, unit, stock')
      .eq('company_id', req.user.company_id)
      .order('name');

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
