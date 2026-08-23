const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isSuperAdmin } = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// GET /api/v1/admins — list super_admin + branch_admin accounts.
// select('*') deliberately, not a named column list — this must keep
// working even before the phase10 migration adds the permissions column
// (select('*') just omits it; a named-column select would 400).
router.get('/', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .select('*')
      .in('role', ['super_admin', 'branch_admin'])
      .order('role', { ascending: false }); // super_admin first
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/admins/:id/permissions — update a single permission key
router.patch('/:id/permissions', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { permission, value } = req.body;
    if (!permission || value === undefined) {
      return error(res, 'permission and value are required', 400);
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('permissions, role')
      .eq('id', req.params.id)
      .single();

    if (!user) return error(res, 'Admin not found', 404);
    if (user.role === 'super_admin') {
      return error(res, 'Cannot restrict super admin permissions', 403);
    }

    const updatedPermissions = { ...(user.permissions || {}), [permission]: value };

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .update({ permissions: updatedPermissions })
      .eq('id', req.params.id)
      .select('id, full_name, permissions')
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Permission updated');
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/admins/:id/toggle — enable/disable a branch admin account
router.patch('/:id/toggle', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { is_active } = req.body;

    if (req.params.id === req.user.id) {
      return error(res, 'Cannot disable your own account', 400);
    }

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .update({ is_active })
      .eq('id', req.params.id)
      .neq('role', 'super_admin') // belt-and-suspenders — super_admin can never be disabled this way
      .select('id, full_name, is_active')
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, `Admin ${is_active ? 'enabled' : 'disabled'}`);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
