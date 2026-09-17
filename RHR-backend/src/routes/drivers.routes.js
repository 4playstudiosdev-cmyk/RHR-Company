const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/drivers — active drivers (approved + pending) in this
// admin's company, each with a customer_count (how many active customers
// currently have this driver assigned) — one extra grouped query rather
// than N+1 per-driver lookups.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('drivers')
      .select('id, company_id, full_name, phone, car_number, is_approved, is_active, created_at')
      .eq('is_active', true);
    const companyId = resolveCompanyId(req);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error: dbErr } = await query.order('full_name');
    if (dbErr) throw new Error(dbErr.message);

    const driverIds = (data || []).map((d) => d.id);
    let countByDriver = {};
    if (driverIds.length) {
      // users.driver_id is a phase17 migration — tolerate it not existing
      // yet so the driver list itself doesn't break before that's run;
      // counts just read as 0 until then.
      const { data: custRows } = await supabaseAdmin
        .from('users')
        .select('driver_id')
        .eq('role', 'customer')
        .eq('is_active', true)
        .in('driver_id', driverIds);
      (custRows || []).forEach((c) => {
        countByDriver[c.driver_id] = (countByDriver[c.driver_id] || 0) + 1;
      });
    }
    const withCounts = (data || []).map((d) => ({ ...d, customer_count: countByDriver[d.id] || 0 }));

    return success(res, withCounts);
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
    const { full_name, phone, car_number, company_id } = req.body;
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

    const [data] = await pgrestPost('drivers', {
      id:          authData.user.id,
      company_id:  targetCompanyId,
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

// GET /api/v1/drivers/:id/customers — customers currently assigned to
// this driver. Confirms the driver is in scope for the requester first
// (super_admin: any branch, branch_admin: their own only).
router.get('/:id/customers', authenticate, isAdmin, async (req, res) => {
  try {
    let drQuery = supabaseAdmin.from('drivers').select('id, company_id').eq('id', req.params.id);
    if (req.user.role !== 'super_admin') drQuery = drQuery.eq('company_id', req.user.company_id);
    const { data: driver } = await drQuery.maybeSingle();
    if (!driver) return error(res, 'Driver not found or access denied', 404);

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, shop_name, rate_tier')
      .eq('driver_id', req.params.id)
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name');
    if (dbErr) throw new Error(dbErr.message);
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
    const { full_name, phone, car_number, is_active } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('drivers', filter, { full_name, phone, car_number, is_active });
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
