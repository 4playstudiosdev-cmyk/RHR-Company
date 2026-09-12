const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/drivers — active drivers (approved + pending) in this admin's company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('drivers')
      .select('id, full_name, phone, car_number, is_approved, is_active, created_at')
      .eq('is_active', true);
    const companyId = resolveCompanyId(req);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error: dbErr } = await query.order('full_name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/pending — self-registered drivers awaiting approval
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('drivers')
      .select('id, full_name, phone, car_number, created_at')
      .eq('is_approved', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    const companyId = resolveCompanyId(req);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error: dbErr } = await query;
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/drivers — admin creates a driver account directly (phone-based, auto-approved)
// Profile insert routed through the raw-https bypass (see
// utils/directQuery.js) — same class of Railway/supabase-js write
// flakiness fixed elsewhere in this codebase, never applied here.
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, car_number } = req.body;
    if (!full_name || !phone)
      return error(res, 'full_name, phone are required', 400);

    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '92' + digits.slice(1);
    const canonical = '+' + digits;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      phone: canonical,
      phone_confirm: true,
      user_metadata: { full_name, role: 'driver' }
    });
    if (authErr) throw new Error(authErr.message);

    const [data] = await pgrestPost('drivers', {
      id:          authData.user.id,
      company_id:  req.user.company_id,
      full_name,
      phone:       canonical,
      car_number:  car_number || null,
      is_approved: true,
      is_active:   true
    });

    return success(res, data, 'Driver account created', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/:id — single driver
router.get('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, phone, car_number, is_approved, is_active, created_at')
      .eq('id', req.params.id)
      .single();
    if (dbErr) return error(res, 'Driver not found', 404);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/drivers/:id — update driver (name/phone/car number/active state)
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, car_number, is_active } = req.body;
    const data = await pgrestPatch(
      'drivers',
      { id: `eq.${req.params.id}`, company_id: `eq.${req.user.company_id}` },
      { full_name, phone, car_number, is_active }
    );
    if (!data?.[0]) return error(res, 'Driver not found', 404);
    return success(res, data[0], 'Driver updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/drivers/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await pgrestPatch(
      'drivers',
      { id: `eq.${req.params.id}`, company_id: `eq.${req.user.company_id}` },
      { is_active: false }
    );
    return success(res, { deleted: true }, 'Driver deactivated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
