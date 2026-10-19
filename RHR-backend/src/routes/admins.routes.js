const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isSuperAdmin } = require('../middleware/role.middleware');
const { success, error } = require('../utils/response');
const { pgrestGet, pgrestPatch } = require('../utils/directQuery');
const { closeOpenSession } = require('../services/auth.service');
const { FEATURES, resolveFeatures, TABLE_BY_ROLE } = require('../utils/appFeatures');

// ── Mobile Access ────────────────────────────────────────────────────────
// Per-account on/off switches for the parts of the customer / salesman /
// driver apps (catalogue in utils/appFeatures.js). Super admin only.
//
// GET /api/v1/admins/mobile-access?role=customer|salesman|driver[&company_id=]
router.get('/mobile-access', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const role = String(req.query.role || '');
    const table = TABLE_BY_ROLE[role];
    if (!table) return error(res, 'role must be customer, salesman or driver', 400);

    const base = role === 'customer'
      ? { select: 'id,company_id,full_name,shop_name,phone', role: 'eq.customer', is_active: 'eq.true', order: 'full_name.asc' }
      : { select: 'id,company_id,full_name,phone', is_active: 'eq.true', order: 'full_name.asc' };
    if (req.query.company_id && req.query.company_id !== 'all') base.company_id = `eq.${req.query.company_id}`;

    // The permissions column may not exist yet on salesmen/drivers
    // (sql/phase69) — then every account just shows its defaults.
    let rows; let columnReady = true;
    try {
      rows = await pgrestGet(table, { ...base, select: `${base.select},permissions` });
    } catch (e) {
      columnReady = false;
      rows = await pgrestGet(table, base);
    }

    const accounts = (rows || []).map((r) => ({
      id: r.id, company_id: r.company_id, name: r.shop_name || r.full_name, contact: r.shop_name ? r.full_name : null,
      phone: r.phone, features: resolveFeatures(role, r.permissions),
    }));
    return success(res, { role, catalog: FEATURES[role], accounts, needsSql: !columnReady });
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/admins/mobile-access  { role, id, feature, value }
router.patch('/mobile-access', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { role, id, feature, value } = req.body;
    const table = TABLE_BY_ROLE[role];
    if (!table || !id) return error(res, 'role and id are required', 400);
    if (!(FEATURES[role] || []).some((f) => f.key === feature)) return error(res, 'Unknown feature', 400);
    if (typeof value !== 'boolean') return error(res, 'value must be true or false', 400);

    let current;
    try {
      current = await pgrestGet(table, { select: 'id,permissions', id: `eq.${id}` });
    } catch (e) {
      return error(res, 'The permissions column is missing — run sql/phase69_mobile_features.sql in Supabase first.', 400);
    }
    if (!current?.[0]) return error(res, 'Account not found', 404);

    const permissions = { ...(current[0].permissions || {}), [feature]: value };
    const rows = await pgrestPatch(table, { id: `eq.${id}` }, { permissions });
    return success(res, { id, features: resolveFeatures(role, rows?.[0]?.permissions || permissions) }, 'Updated');
  } catch (err) { return error(res, err.message); }
});

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

// PATCH /api/v1/admins/:id/force-logout — clears the single-session lock
// (see auth.service.js#loginWithCredentials) for an admin whose browser
// was closed without logging out, so their next login isn't blocked by
// their own stale session. The lock also self-expires after 8h on its
// own; this is just for when the super_admin wants it cleared sooner.
router.patch('/:id/force-logout', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const data = await pgrestPatch(
      'users',
      { id: `eq.${req.params.id}` },
      { active_session_token: null, active_session_started_at: null }
    );
    if (!data?.[0]) return error(res, 'Admin not found', 404);
    await closeOpenSession(req.params.id, 'force_logout_by_admin');
    return success(res, data[0], 'Session cleared — they can log in again now');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/admins/:id/sessions — login/logout history for one admin
// (see admin_login_sessions, phase33): when they logged in, from where
// (if location was shared), and when/why that session ended.
router.get('/:id/sessions', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const data = await pgrestGet('admin_login_sessions', {
      select: '*',
      user_id: `eq.${req.params.id}`,
      order: 'login_at.desc',
      limit: '20',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
