const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/drivers — active drivers (approved + pending) in this
// admin's company, each with a customer_count (how many active customers
// currently have this driver assigned) — one extra grouped query rather
// than N+1 per-driver lookups.
//
// Routed through the raw-https bypass (see utils/directQuery.js) — same
// fix as GET /salesmen: plain supabase-js was confirmed (via a live
// production probe) to silently return an empty array for this exact
// query on Railway even though the table has real rows, which is why
// Drivers never showed up in the desktop UI.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,full_name,phone,car_number,vehicle_id,is_approved,is_active,created_at',
      is_active: 'eq.true',
      order: 'full_name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    // vehicle_id is a phase32 addition — fall back to the plain column
    // list if that migration hasn't run yet.
    let data;
    try {
      data = await pgrestGet('drivers', params);
    } catch (e) {
      data = await pgrestGet('drivers', { ...params, select: 'id,company_id,full_name,phone,car_number,is_approved,is_active,created_at' });
    }

    const driverIds = (data || []).map((d) => d.id);
    let countByDriver = {};
    if (driverIds.length) {
      try {
        // users.driver_id is a phase17 migration — tolerate it not
        // existing yet so the driver list itself doesn't break before
        // that's run; counts just read as 0 until then.
        const custRows = await pgrestGet('users', {
          select: 'driver_id',
          role: 'eq.customer',
          is_active: 'eq.true',
          driver_id: `in.(${driverIds.join(',')})`,
        });
        (custRows || []).forEach((c) => {
          countByDriver[c.driver_id] = (countByDriver[c.driver_id] || 0) + 1;
        });
      } catch (e) { /* driver_id not migrated yet — counts stay 0 */ }
    }
    const withCounts = (data || []).map((d) => ({ ...d, customer_count: countByDriver[d.id] || 0 }));

    return success(res, withCounts);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/pending — self-registered drivers awaiting approval
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,full_name,phone,car_number,created_at',
      is_approved: 'eq.false',
      is_active: 'eq.true',
      order: 'created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('drivers', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/drivers — admin creates a driver account directly (phone-based, auto-approved)
// Profile insert routed through the raw-https bypass (see
// utils/directQuery.js) — same class of Railway/supabase-js write
// flakiness fixed elsewhere in this codebase, never applied here.
//
// company_id used to be hardcoded to req.user.company_id — for
// super_admin (always Karachi) that meant a driver "added" while the
// CityFilter dropdown had Hyderabad/Sukkur selected silently landed in
// Karachi instead: the create call succeeded, but the current
// (HYD/SUK-filtered) list reload could never show a row that isn't
// actually there. branch_admin still always creates into their own
// branch regardless of what's sent.
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, car_number, company_id, vehicle_id } = req.body;
    if (!full_name || !phone)
      return error(res, 'full_name, phone are required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '92' + digits.slice(1);
    const canonical = '+' + digits;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      phone: canonical,
      phone_confirm: true,
      user_metadata: { full_name, role: 'driver' }
    });
    if (authErr) throw new Error(authErr.message);

    const baseRow = {
      id:          authData.user.id,
      company_id:  targetCompanyId,
      full_name,
      phone:       canonical,
      car_number:  car_number || null,
      is_approved: true,
      is_active:   true
    };

    // vehicle_id is a phase32 addition — fall back to inserting without
    // it if that migration hasn't run yet.
    let data;
    try {
      [data] = await pgrestPost('drivers', { ...baseRow, vehicle_id: vehicle_id || null });
    } catch (e) {
      [data] = await pgrestPost('drivers', baseRow);
    }

    return success(res, data, 'Driver account created', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/:id — single driver
router.get('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const rows = await pgrestGet('drivers', {
      select: 'id,full_name,phone,car_number,is_approved,is_active,created_at',
      id: `eq.${req.params.id}`,
    });
    if (!rows?.[0]) return error(res, 'Driver not found', 404);
    return success(res, rows[0]);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/drivers/:id/customers — customers currently assigned to
// this driver. Confirms the driver is in scope for the requester first
// (super_admin: any branch, branch_admin: their own only).
router.get('/:id/customers', authenticate, isAdmin, async (req, res) => {
  try {
    const drParams = { select: 'id,company_id', id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') drParams.company_id = `eq.${req.user.company_id}`;
    const drRows = await pgrestGet('drivers', drParams);
    if (!drRows?.[0]) return error(res, 'Driver not found or access denied', 404);

    const data = await pgrestGet('users', {
      select: 'id,full_name,phone,shop_name,rate_tier',
      driver_id: `eq.${req.params.id}`,
      role: 'eq.customer',
      is_active: 'eq.true',
      order: 'full_name.asc',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/drivers/:id — update driver (name/phone/car number/active state)
// Scoping to req.user.company_id unconditionally meant super_admin could
// never edit a Hyderabad/Sukkur driver (their own company_id is always
// Karachi's, so the filter matched nothing and this silently 404'd) —
// same fix as Customers/Salesmen: super_admin can act on any branch,
// branch_admin stays locked to their own.
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, car_number, is_active, vehicle_id } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    // vehicle_id is a phase32 addition — fall back to patching without it
    // if that migration hasn't run yet.
    let data;
    try {
      data = await pgrestPatch('drivers', filter, { full_name, phone, car_number, is_active, vehicle_id });
    } catch (e) {
      data = await pgrestPatch('drivers', filter, { full_name, phone, car_number, is_active });
    }
    if (!data?.[0]) return error(res, 'Driver not found', 404);
    return success(res, data[0], 'Driver updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/drivers/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    await pgrestPatch('drivers', filter, { is_active: false });
    return success(res, { deleted: true }, 'Driver deactivated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
