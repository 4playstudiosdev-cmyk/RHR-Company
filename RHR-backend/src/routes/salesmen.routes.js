const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/salesmen — active salesmen (approved + pending) in this admin's company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('salesmen')
      .select('id, full_name, phone, email, position, is_approved, is_active, created_at')
      .eq('company_id', req.user.company_id)
      .eq('is_active', true)
      .order('full_name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/salesmen/pending — self-registered salesmen awaiting approval
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('salesmen')
      .select('id, full_name, phone, created_at')
      .eq('company_id', req.user.company_id)
      .eq('is_approved', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/salesmen — admin creates a salesman account directly (email+password)
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, email, password, position } = req.body;
    if (!full_name || !email || !password)
      return error(res, 'full_name, email, password are required', 400);

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'salesman' }
    });
    if (authErr) throw new Error(authErr.message);

    const { data, error: dbErr } = await supabaseAdmin
      .from('salesmen')
      .insert({
        id:         authData.user.id,
        company_id: req.user.company_id,
        full_name,
        phone:      phone || null,
        email,
        position:   position || null,
        is_approved: true,
        is_active:   true
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Salesman account created', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/salesmen/:id — single salesman
router.get('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('salesmen')
      .select('id, full_name, phone, email, position, is_approved, is_active, created_at')
      .eq('id', req.params.id)
      .single();
    if (dbErr) return error(res, 'Salesman not found', 404);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/salesmen/:id — update salesman (name/phone/position/active state)
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, position, is_active } = req.body;
    const { data, error: dbErr } = await supabaseAdmin
      .from('salesmen')
      .update({ full_name, phone, position, is_active })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Salesman updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/salesmen/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await supabaseAdmin
      .from('salesmen')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    return success(res, { deleted: true }, 'Salesman deactivated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
