const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/production/materials
const getMaterials = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('raw_materials')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/production/materials
const createMaterial = async (req, res) => {
  try {
    const { name, category, unit, stock, min_level } = req.body;
    if (!name || !category || !unit)
      return error(res, 'name, category, unit are required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('raw_materials')
      .insert({
        company_id: req.user.company_id,
        name,
        category,
        unit,
        stock:     Number(stock) || 0,
        min_level: Number(min_level) || 0
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Material added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/production/materials/:id/stock
const addStock = async (req, res) => {
  try {
    const { quantity, date, note } = req.body;
    if (!quantity || Number(quantity) <= 0)
      return error(res, 'quantity must be a positive number', 400);

    const { data: material, error: findErr } = await supabaseAdmin
      .from('raw_materials')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
    if (findErr || !material) return error(res, 'Material not found', 404);

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('raw_materials')
      .update({ stock: Number(material.stock) + Number(quantity) })
      .eq('id', req.params.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin.from('raw_material_stock_logs').insert({
      material_id: req.params.id,
      company_id:  req.user.company_id,
      quantity:    Number(quantity),
      note:        note || null,
      logged_date: date || new Date().toISOString().split('T')[0],
      created_by:  req.user.id
    });

    return success(res, updated, 'Stock updated');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getMaterials, createMaterial, addStock };
