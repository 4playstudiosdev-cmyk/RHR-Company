const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestPost, pgrestPatch } = require('../utils/directQuery');

// GET /api/v1/salesmen — active salesmen (approved + pending) in this
// admin's company, each with a customer_count (how many active customers
// currently have this salesman assigned) — fetched as one extra grouped
// query rather than N+1 per-salesman lookups.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('salesmen')
      .select('id, company_id, full_name, phone, email, position, is_approved, is_active, created_at')
      .eq('is_active', true);
    const companyId = resolveCompanyId(req);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error: dbErr } = await query.order('full_name');
    if (dbErr) throw new Error(dbErr.message);

    const salesmanIds = (data || []).map((s) => s.id);
    let countBySalesman = {};
    if (salesmanIds.length) {
      const { data: custRows } = await supabaseAdmin
        .from('users')
        .select('salesman_id')
        .eq('role', 'customer')
        .eq('is_active', true)
        .in('salesman_id', salesmanIds);
      (custRows || []).forEach((c) => {
        countBySalesman[c.salesman_id] = (countBySalesman[c.salesman_id] || 0) + 1;
      });
    }
    const withCounts = (data || []).map((s) => ({ ...s, customer_count: countBySalesman[s.id] || 0 }));

    return success(res, withCounts);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/salesmen/pending — self-registered salesmen awaiting approval
router.get('/pending', authenticate, isAdmin, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('salesmen')
      .select('id, full_name, phone, created_at')
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

// POST /api/v1/salesmen — admin creates a salesman account directly (email+password)
// The profile insert is routed through the raw-https bypass (see
// utils/directQuery.js) — plain supabase-js writes have intermittently
// thrown a spurious empty-result/RLS error on Railway for this exact
// shape of insert elsewhere in the codebase (auth.service.js's registration
// flows, admins.routes.js), and this one was never migrated.
//
// company_id used to be hardcoded to req.user.company_id — for
// super_admin (always Karachi) that meant a salesman "added" while the
// CityFilter dropdown had Hyderabad/Sukkur selected silently landed in
// Karachi instead: the create call succeeded, but the current
// (HYD/SUK-filtered) list reload could never show a row that isn't
// actually there. branch_admin still always creates into their own
// branch regardless of what's sent.
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, email, password, position, company_id } = req.body;
    if (!full_name || !email || !password)
      return error(res, 'full_name, email, password are required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'salesman' }
    });
    if (authErr) throw new Error(authErr.message);

    const [data] = await pgrestPost('salesmen', {
      id:         authData.user.id,
      company_id: targetCompanyId,
      full_name,
      phone:      phone || null,
      email,
      position:   position || null,
      is_approved: true,
      is_active:   true
    });

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

// GET /api/v1/salesmen/:id/customers — customers currently assigned to
// this salesman. Confirms the salesman is in scope for the requester
// first (super_admin: any branch, branch_admin: their own only) so a
// branch_admin can't enumerate another branch's customers by guessing a
// salesman id.
router.get('/:id/customers', authenticate, isAdmin, async (req, res) => {
  try {
    let smQuery = supabaseAdmin.from('salesmen').select('id, company_id').eq('id', req.params.id);
    if (req.user.role !== 'super_admin') smQuery = smQuery.eq('company_id', req.user.company_id);
    const { data: salesman } = await smQuery.maybeSingle();
    if (!salesman) return error(res, 'Salesman not found or access denied', 404);

    const { data, error: dbErr } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, shop_name, rate_tier')
      .eq('salesman_id', req.params.id)
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name');
    if (dbErr) throw new Error(dbErr.message);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/salesmen/:id — update salesman (name/phone/position/active state)
// Scoping to req.user.company_id unconditionally meant super_admin could
// never edit a Hyderabad/Sukkur salesman (their own company_id is always
// Karachi's, so the filter matched nothing and this silently 404'd) —
// same fix as Customers: super_admin can act on any branch, branch_admin
// stays locked to their own.
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { full_name, phone, position, is_active } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('salesmen', filter, { full_name, phone, position, is_active });
    if (!data?.[0]) return error(res, 'Salesman not found', 404);
    return success(res, data[0], 'Salesman updated');
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/salesmen/:id — soft delete
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    await pgrestPatch('salesmen', filter, { is_active: false });
    return success(res, { deleted: true }, 'Salesman deactivated');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
