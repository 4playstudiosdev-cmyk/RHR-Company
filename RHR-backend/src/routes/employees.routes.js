const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// Plain HR directory records — no login account, no auth.users row.
// See sql/phase9_employees_directory.sql. Contrast with /salesmen,
// which creates a real Supabase Auth account for the mobile app.

// GET /api/v1/employees — active employees in this admin's company
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, phone, email, address, city, salary, is_active, created_at')
      .eq('company_id', req.user.company_id)
      .eq('is_active', true)
      .order('full_name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/employees — add an employee record (no account created)
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, email, address, city, salary } = req.body;
    if (!full_name) return error(res, 'full_name is required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('employees')
      .insert({
        company_id: req.user.company_id,
        full_name,
        phone:   phone || null,
        email:   email || null,
        address: address || null,
        city:    city || null,
        salary:  salary === '' || salary == null ? null : Number(salary)
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Employee added', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/employees/:id
router.get('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, phone, email, address, city, salary, is_active, created_at')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
    if (dbErr) return error(res, 'Employee not found', 404);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/employees/:id
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, email, address, city, salary } = req.body;
    const { data, error: dbErr } = await supabaseAdmin
      .from('employees')
      .update({
        full_name,
        phone,
        email,
        address,
        city,
        salary: salary === '' || salary == null ? null : Number(salary)
      })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Employee updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/employees/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await supabaseAdmin
      .from('employees')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    return success(res, { deleted: true }, 'Employee removed');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
