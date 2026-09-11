const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isSuperAdmin } = require('../middleware/role.middleware');
const { success, error } = require('../utils/response');
const { pgrestGet, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/admins — list super_admin + branch_admin accounts.
// select('*') deliberately, not a named column list — this must keep
// working even before the phase10 migration adds the permissions column
// (select('*') just omits it; a named-column select would 400).
// Routed through the raw-https bypass (see utils/directQuery.js) — same
// class of supabase-js-on-Railway flakiness documented there; this route
// was still on plain supabase-js and untested against that failure mode.
router.get('/', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const data = await pgrestGet('users', {
      select: '*',
      role: 'in.(super_admin,branch_admin)',
      order: 'role.desc', // super_admin first
    });
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

    const rows = await pgrestGet('users', {
      select: 'permissions,role',
      id: `eq.${req.params.id}`,
    });
    const user = rows?.[0];

    if (!user) return error(res, 'Admin not found', 404);
    if (user.role === 'super_admin') {
      return error(res, 'Cannot restrict super admin permissions', 403);
    }

    const updatedPermissions = { ...(user.permissions || {}), [permission]: value };

    const data = await pgrestPatch('users', { id: `eq.${req.params.id}` }, { permissions: updatedPermissions });
    return success(res, data?.[0], 'Permission updated');
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/admins/:id/toggle — enable/disable a branch admin account
router.patch('/:id/toggle', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { is_active } = req.body;

    if (req.params.id === req.user.id) {
      return error(res, 'Cannot disable your own account', 400);
    }

    const data = await pgrestPatch(
      'users',
      { id: `eq.${req.params.id}`, role: 'neq.super_admin' }, // belt-and-suspenders — super_admin can never be disabled this way
      { is_active }
    );
    if (!data?.[0]) return error(res, 'Admin not found', 404);
    return success(res, data[0], `Admin ${is_active ? 'enabled' : 'disabled'}`);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
