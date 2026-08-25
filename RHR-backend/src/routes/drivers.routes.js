const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/drivers — active drivers (approved + pending) in this admin's company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, phone, car_number, is_approved, is_active, created_at')
      .eq('company_id', req.user.company_id)
      .eq('is_active', true)
      .order('full_name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/pending — self-registered drivers awaiting approval
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('drivers')
      .select('id, full_name, phone, car_number, created_at')
      .eq('company_id', req.user.company_id)
      .eq('is_approved', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/drivers — admin creates a driver account directly (phone-based, auto-approved)
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

    const { data, error: dbErr } = await supabaseAdmin
      .from('drivers')
      .insert({
        id:          authData.user.id,
        company_id:  req.user.company_id,
        full_name,
        phone:       canonical,
        car_number:  car_number || null,
        is_approved: true,
        is_active:   true
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
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
    const { data, error: dbErr } = await supabaseAdmin
      .from('drivers')
      .update({ full_name, phone, car_number, is_active })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Driver updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/drivers/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await supabaseAdmin
      .from('drivers')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    return success(res, { deleted: true }, 'Driver deactivated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
