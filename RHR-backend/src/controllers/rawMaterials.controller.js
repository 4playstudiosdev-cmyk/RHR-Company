const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { getCached, setCached, invalidate } = require('../utils/simpleCache');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');

const CACHE_TTL_MS = 60000;

// GET /api/v1/production/materials
const getMaterials = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const cacheKey = `materials:${companyId || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) return success(res, cached);

    // Proved via a raw-https diagnostic that supabase-js's own HTTP client
    // was silently returning an empty body for this exact query on
    // Railway (status 200, correct headers, empty array) while an
    // identical raw https request, at the same moment, always returned
    // the correct 16 rows — see src/utils/directQuery.js for the full
    // writeup. Routed through that instead of supabase-js here.
    const params = { select: '*', order: 'name.asc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('raw_materials', params);

    if (data && data.length > 0) setCached(cacheKey, data, CACHE_TTL_MS);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/production/materials
// Routed through the raw-https bypass (see utils/directQuery.js) — this
// write path was still on plain supabase-js, the exact pattern that's
// intermittently thrown a spurious empty-result/RLS error on Railway for
// this same table's reads (already fixed in getMaterials above) and
// writes elsewhere in the codebase.
const createMaterial = async (req, res) => {
  try {
    const { name, category, unit, stock, min_level } = req.body;
    if (!name || !category || !unit)
      return error(res, 'name, category, unit are required', 400);

    const [data] = await pgrestPost('raw_materials', {
      company_id: req.user.company_id,
      name,
      category,
      unit,
      stock:     Number(stock) || 0,
      min_level: Number(min_level) || 0
    });

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

// GET /api/v1/production/materials/stock-report — in/out/closing balance
// per raw material. raw_material_stock_logs already carries every
// movement (positive = added via addStock above, negative = consumed by
// a production run — see runProduction in production.controller.js), so
// unlike products (which have no equivalent log table) this is a
// straight sum from real history rather than derived from other tables.
// "Closing balance" is the material's current stock, the same live
// running total those log rows already feed into.
const getStockReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const companyId = resolveCompanyId(req);
    if (!companyId) return error(res, 'company_id is required', 400);

    const { data: materials, error: mErr } = await supabaseAdmin
      .from('raw_materials')
      .select('id, name, category, unit, stock, min_level')
      .eq('company_id', companyId)
      .order('name');
    if (mErr) throw new Error(mErr.message);

    let logsQuery = supabaseAdmin
      .from('raw_material_stock_logs')
      .select('material_id, quantity, logged_date')
      .eq('company_id', companyId);
    if (from) logsQuery = logsQuery.gte('logged_date', from);
    if (to)   logsQuery = logsQuery.lte('logged_date', to);
    const { data: logs, error: lErr } = await logsQuery;
    if (lErr) throw new Error(lErr.message);

    const inByMaterial = {};
    const outByMaterial = {};
    (logs || []).forEach((l) => {
      const qty = Number(l.quantity);
      if (qty >= 0) inByMaterial[l.material_id] = (inByMaterial[l.material_id] || 0) + qty;
      else outByMaterial[l.material_id] = (outByMaterial[l.material_id] || 0) + Math.abs(qty);
    });

    const data = materials.map((m) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      unit: m.unit,
      minLevel: Number(m.min_level) || 0,
      stockIn: inByMaterial[m.id] || 0,
      stockOut: outByMaterial[m.id] || 0,
      closingBalance: Number(m.stock)
    }));
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

module.exports = { getMaterials, createMaterial, addStock, getStockReport };
