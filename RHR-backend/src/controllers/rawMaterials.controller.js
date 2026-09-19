const https = require('https');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { getCached, setCached, invalidate } = require('../utils/simpleCache');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
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
    const params = { select: '*', order: 'name.asc', is_active: 'eq.true' };
    if (companyId) params.company_id = `eq.${companyId}`;
    let data;
    try {
      data = await pgrestGet('raw_materials', params);
    } catch (e) {
      // is_active is a phase17 migration — if it hasn't been run yet,
      // PostgREST 400s on the unknown filter column. Fall back to the
      // unfiltered query so the list still works (just without
      // soft-delete filtering) instead of breaking outright.
      const { is_active, ...fallbackParams } = params;
      data = await pgrestGet('raw_materials', fallbackParams);
    }

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

    invalidate('materials:');
    return success(res, data, 'Material added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/production/materials/:id — edit name/category/unit/stock/min_level
const updateMaterial = async (req, res) => {
  try {
    const { name, category, unit, stock, min_level } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const data = await pgrestPatch('raw_materials', filter, {
      name,
      category,
      unit,
      stock:     stock !== undefined ? Number(stock) : undefined,
      min_level: min_level !== undefined ? Number(min_level) : undefined
    });
    if (!data?.[0]) return error(res, 'Material not found or access denied', 404);

    invalidate('materials:');
    return success(res, data[0], 'Material updated');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/production/materials/:id — soft delete (is_active:
// false), not a hard DELETE FROM. Real recipes (production_bom_items)
// and stock history (raw_material_stock_logs) reference this row by id
// — a hard delete would either violate those FKs or, if cascaded,
// silently destroy that history. Needs sql/phase17 run first.
const deleteMaterial = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const data = await pgrestPatch('raw_materials', filter, { is_active: false });
    if (!data?.[0]) return error(res, 'Material not found or access denied', 404);

    invalidate('materials:');
    return success(res, { deleted: true }, 'Material deleted');
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

// POST /api/v1/production/materials/purchase — bulk stock-in from a
// supplier purchase: adds to stock and writes one raw_material_stock_logs
// row per material (same audit trail as addStock above), all in one call
// so the frontend can turn the result into a single purchase invoice PDF.
// Written against the raw-https bypass from the start rather than plain
// supabaseAdmin — see addStock above and utils/directQuery.js for why.
const purchaseMaterials = async (req, res) => {
  try {
    const { items, supplier_name, purchase_date } = req.body;
    if (!Array.isArray(items) || !items.length)
      return error(res, 'No items provided', 400);

    for (const item of items) {
      if (!item.raw_material_id || !item.qty || Number(item.qty) <= 0 ||
          item.price_per_unit === undefined || item.price_per_unit === '' || Number(item.price_per_unit) < 0)
        return error(res, 'Each item needs a material, a positive quantity, and a price per unit', 400);
    }

    const purchaseDate = purchase_date || new Date().toISOString().split('T')[0];
    const purchaseId = require('crypto').randomUUID();
    const results = [];

    for (const item of items) {
      const matRows = await pgrestGet('raw_materials', {
        select: 'id,name,unit,stock,company_id',
        id: `eq.${item.raw_material_id}`,
      });
      const mat = matRows?.[0];
      if (!mat) continue;
      if (req.user.role !== 'super_admin' && mat.company_id !== req.user.company_id) continue;

      const qty = Number(item.qty);
      const pricePerUnit = Number(item.price_per_unit);

      await pgrestPatch('raw_materials', { id: `eq.${item.raw_material_id}` }, { stock: Number(mat.stock) + qty });

      const logRow = {
        material_id: item.raw_material_id,
        company_id:  mat.company_id,
        quantity:    qty,
        note:        `Purchased${supplier_name ? ' from ' + supplier_name : ''} @ PKR ${pricePerUnit}/unit`,
        logged_date: purchaseDate,
        created_by:  req.user.id,
      };
      try {
        // purchase_id/supplier_name/price_per_unit are a phase18 addition
        // (needed for the Purchase Report to group items back into one
        // purchase and total them) — fall back to the plain log row if
        // that migration hasn't run yet, so purchasing still works.
        await pgrestPost('raw_material_stock_logs', {
          ...logRow,
          purchase_id: purchaseId,
          supplier_name: supplier_name || null,
          price_per_unit: pricePerUnit,
        });
      } catch (e) {
        await pgrestPost('raw_material_stock_logs', logRow);
      }

      results.push({
        raw_material_id: item.raw_material_id,
        name: mat.name,
        unit: mat.unit,
        qty,
        price_per_unit: pricePerUnit,
        total: qty * pricePerUnit,
      });
    }

    if (!results.length) return error(res, 'No valid materials found for this purchase', 400);

    invalidate('materials:');

    return success(res, {
      purchase_id: purchaseId,
      items: results,
      grand_total: results.reduce((sum, r) => sum + r.total, 0),
      supplier_name: supplier_name || null,
      purchase_date: purchaseDate,
    }, 'Purchase recorded — stock updated', 201);
  } catch (err) { return error(res, err.message); }
};

// Calls Claude directly over raw https (same style as the PostgREST
// bypass in utils/directQuery.js) rather than pulling in an SDK for one
// endpoint. Requires ANTHROPIC_API_KEY in the environment — get one from
// console.anthropic.com and set it on the Railway service; until then
// this endpoint returns a clear error instead of a stack trace.
const EXTRACTION_PROMPT = `Extract every line item from this purchase invoice image. Return ONLY a JSON array, no other text and no markdown code fences, in this exact shape:
[{"name": "Gray Cement", "quantity": 50, "unit": "Kg", "price_per_unit": 28}]
If a quantity, unit or price isn't legible, make a reasonable estimate rather than omitting the item. Do not include a "total" field.`;

function callAnthropicVision(base64, mediaType) {
  return new Promise((resolve, reject) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return reject(new Error('ANTHROPIC_API_KEY is not configured on the server — invoice scanning is unavailable until it is set'));
    }
    const payload = JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: EXTRACTION_PROMPT }
        ]
      }]
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Anthropic API ${res.statusCode}: ${body.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Anthropic API returned a non-JSON body')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Anthropic API request timed out')); });
    req.write(payload);
    req.end();
  });
}

// POST /api/v1/production/materials/ocr-extract — Feature 2's invoice
// upload step. Takes a base64 invoice image, asks Claude to read its line
// items, then matches each extracted name against this branch's real raw
// materials (substring match, case-insensitive) so the frontend's
// editable table can pre-fill a dropdown instead of the admin matching
// every row by hand.
const extractInvoiceItems = async (req, res) => {
  try {
    const { image_base64, media_type } = req.body;
    if (!image_base64) return error(res, 'image_base64 is required', 400);

    const apiRes = await callAnthropicVision(image_base64, media_type || 'image/jpeg');
    const rawText = apiRes.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return error(res, 'Could not find item data in the invoice image — try adding items manually', 422);

    let items;
    try {
      items = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return error(res, 'Could not parse the extracted invoice data — try adding items manually', 422);
    }

    const materials = await pgrestGet('raw_materials', {
      select: 'id,name,unit',
      company_id: `eq.${req.user.company_id}`,
      is_active: 'eq.true',
    }).catch(() => []);

    const matched = items.map((item) => {
      const nameLower = String(item.name || '').toLowerCase();
      const match = materials.find((m) =>
        nameLower && (m.name.toLowerCase().includes(nameLower) || nameLower.includes(m.name.toLowerCase()))
      );
      return {
        name: item.name || 'Unknown',
        quantity: Number(item.quantity) || 0,
        unit: item.unit || match?.unit || '',
        price_per_unit: Number(item.price_per_unit) || 0,
        raw_material_id: match?.id || '',
      };
    });

    return success(res, { items: matched });
  } catch (err) { return error(res, err.message, 502); }
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

module.exports = { getMaterials, createMaterial, updateMaterial, deleteMaterial, addStock, purchaseMaterials, extractInvoiceItems, getStockReport };
