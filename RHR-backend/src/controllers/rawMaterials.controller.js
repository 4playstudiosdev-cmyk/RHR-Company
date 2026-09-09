const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { retryIfEmpty } = require('../utils/withRetry');
const { getCached, setCached, invalidate } = require('../utils/simpleCache');

const CACHE_TTL_MS = 60000;

// GET /api/v1/production/materials
const getMaterials = async (req, res) => {
  try {
    const cacheKey = `materials:${req.user.company_id}`;
    const cached = getCached(cacheKey);
    if (cached) return success(res, cached);

    // raw_materials is the table most exposed to the Railway<->Supabase
    // blip this project keeps hitting — a successful-but-wrongly-empty
    // read. See src/utils/withRetry.js. Bumped past the default budget
    // (was 4x350ms=1.4s) — live testing showed this table's bad windows
    // can run 1-2 minutes, well past what a couple of quick retries can
    // paper over; 6x600ms buys more coverage without stalling the page
    // load into feeling broken. Still not a full guarantee against a
    // very long window — see the withRetry.js header comment. Caching a
    // successful result (below) means only the first load after a
    // write/restart ever has to survive that wait — every load after
    // that is instant from memory until the next write invalidates it.
    const data = await retryIfEmpty(async () => {
      const { data, error: dbErr } = await supabaseAdmin
        .from('raw_materials')
        .select('*')
        .eq('company_id', req.user.company_id)
        .order('name');
      if (dbErr) throw new Error(dbErr.message);
      return data;
    }, 6, 600);

    if (data && data.length > 0) setCached(cacheKey, data, CACHE_TTL_MS);
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
    invalidate(`materials:${req.user.company_id}`);
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

    invalidate(`materials:${req.user.company_id}`);
    return success(res, updated, 'Stock updated');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getMaterials, createMaterial, addStock };
