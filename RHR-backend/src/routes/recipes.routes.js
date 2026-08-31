const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/recipes
// Returns all recipes with ingredients for this company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('production_recipes')
      .select(`
        *,
        recipe_ingredients(
          id, quantity, unit, raw_material_id,
          raw_materials(id, name, unit, stock)
        ),
        products!product_id(id, name, unit, stock_quantity)
      `)
      .eq('company_id', req.user.company_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
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
      ingredients // array: [{ raw_material_id, qty_required, unit }]
    } = req.body;

    if (!recipe_name || !finished_item_id || !ingredients?.length)
      return error(res, 'recipe_name, finished_item_id, ingredients are required', 400);

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

    // Look up names for the denormalized ingredient_name column (kept
    // alongside raw_material_id — some older reporting queries may still
    // read it, and it's a harmless free display copy).
    const materialIds = ingredients.map(i => i.raw_material_id).filter(Boolean);
    const { data: materials } = await supabaseAdmin
      .from('raw_materials')
      .select('id, name')
      .in('id', materialIds);
    const nameById = Object.fromEntries((materials || []).map(m => [m.id, m.name]));

    // Insert ingredients
    const rows = ingredients.map(i => ({
      recipe_id:       recipe.id,
      raw_material_id: i.raw_material_id,
      ingredient_name: nameById[i.raw_material_id] || null,
      quantity:        Number(i.qty_required),
      unit:            i.unit,
    }));

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
