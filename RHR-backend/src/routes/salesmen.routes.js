const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin, isSalesman, requireRole } = require('../middleware/role.middleware');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { withRetry } = require('../utils/withRetry');
const { normalizePhone, phoneLast10 } = require('../utils/phone');
const { deleteSalesmanPermanently } = require('../services/hardDelete.service');

// GET /api/v1/salesmen/directory — a driver needs to see who's who
// (name + phone) for the salesman attached to a customer they're
// delivering to, same reasoning as the bank-accounts/list widening in
// bank.routes.js. Deliberately placed before the admin-only GET '/'
// below so it isn't shadowed, and before any '/:id' pattern for the
// same reason.
router.get('/directory', authenticate, requireRole('super_admin', 'branch_admin', 'driver'), async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,full_name,phone,position',
      is_active: 'eq.true',
      order: 'full_name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('salesmen', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// A salesman's profile is "complete" once every one of these is filled —
// mirrors customers.controller.js's isProfileComplete, same required-field
// list as auth.controller.js's verifyOTPHandler uses at login time.
const REQUIRED_PROFILE_FIELDS = [
  'full_name', 'phone', 'nic_number',
  'profile_photo_url', 'nic_image_url', 'nic_back_image_url',
];
function isProfileComplete(salesman) {
  return REQUIRED_PROFILE_FIELDS.every(
    (f) => salesman[f] != null && String(salesman[f]).trim() !== ''
  );
}

// GET /api/v1/salesmen/me/profile — self-service
router.get('/me/profile', authenticate, isSalesman, async (req, res) => {
  try {
    const rows = await pgrestGet('salesmen', {
      select: 'id,full_name,phone,nic_number,profile_photo_url,nic_image_url,nic_back_image_url',
      id: `eq.${req.user.id}`,
    });
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) });
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/salesmen/me/profile — self-service, used by both the
// forced first-login "Complete Your Profile" screen and the later "Edit
// Profile" entry point. Only ever writes fields actually present in the
// body so a partial save never blanks the rest — same pattern as
// customers.controller.js's updateMyProfile.
router.patch('/me/profile', authenticate, isSalesman, async (req, res) => {
  try {
    const { full_name, phone, nic_number, profile_photo_url, nic_image_url, nic_back_image_url } = req.body;

    const update = {};
    if (full_name != null)          update.full_name = full_name;
    // Fully normalized (not just stripped of spaces/dashes) — see
    // utils/phone.js and the identical fix in drivers.routes.js for why.
    if (phone != null)              update.phone = normalizePhone(phone);
    if (nic_number != null)         update.nic_number = nic_number;
    if (profile_photo_url != null)  update.profile_photo_url = profile_photo_url;
    if (nic_image_url != null)      update.nic_image_url = nic_image_url;
    if (nic_back_image_url != null) update.nic_back_image_url = nic_back_image_url;

    if (Object.keys(update).length === 0) return error(res, 'No fields to update', 400);

    // Same transient Railway<->Supabase blip withRetry.js documents and
    // customers.controller.js's updateMyProfile already guards against.
    const rows = await withRetry(() => pgrestPatch('salesmen', { id: `eq.${req.user.id}` }, update));
    const data = rows?.[0];
    if (!data) return error(res, 'Profile not found', 404);
    return success(res, { ...data, profileComplete: isProfileComplete(data) }, 'Profile updated');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/salesmen — active salesmen (approved + pending) in this
// admin's company, each with a customer_count (how many active customers
// currently have this salesman assigned) — fetched as one extra grouped
// query rather than N+1 per-salesman lookups.
//
// Routed through the raw-https bypass (see utils/directQuery.js) — this
// was still on plain supabase-js, which was confirmed (via a live
// production probe) to silently return an empty array for this exact
// query on Railway: status 200, correct headers, but no rows, while the
// same table always has the expected data when queried directly through
// the bypass at the same moment. Same class of bug already fixed for
// raw_materials/production_bom reads elsewhere in this codebase — this
// endpoint was just never migrated, which is why Salesmen never showed
// up in the desktop UI despite existing in the database.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,full_name,phone,email,position,is_approved,is_active,created_at,nic_number,profile_photo_url,nic_image_url,nic_back_image_url',
      is_active: 'eq.true',
      order: 'full_name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('salesmen', params);

    const salesmanIds = (data || []).map((s) => s.id);
    let countBySalesman = {};
    if (salesmanIds.length) {
      const custRows = await pgrestGet('users', {
        select: 'salesman_id',
        role: 'eq.customer',
        is_active: 'eq.true',
        salesman_id: `in.(${salesmanIds.join(',')})`,
      });
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
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,full_name,phone,created_at',
      is_approved: 'eq.false',
      is_active: 'eq.true',
      order: 'created_at.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('salesmen', params);
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

    // Normalized the same way phone+OTP registration/login stores it
    // (see utils/phone.js) — an unnormalized phone here used to let the
    // same person end up with a second, duplicate salesman account the
    // first time they later logged into the app with phone+OTP.
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    if (normalizedPhone) {
      const existingRows = await pgrestGet('salesmen', {
        select: 'id',
        or: `(phone.eq.${normalizedPhone},phone.eq.${normalizedPhone.replace('+', '')},phone.like.*${phoneLast10(phone)})`,
      });
      if (existingRows?.[0]) return error(res, 'A salesman with this phone number already exists', 400);
    }

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
      phone:      normalizedPhone,
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
    const rows = await pgrestGet('salesmen', {
      select: 'id,full_name,phone,email,position,is_approved,is_active,created_at',
      id: `eq.${req.params.id}`,
    });
    if (!rows?.[0]) return error(res, 'Salesman not found', 404);
    return success(res, rows[0]);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/salesmen/:id/customers — customers currently assigned to
// this salesman. Confirms the salesman is in scope for the requester
// first (super_admin: any branch, branch_admin: their own only) so a
// branch_admin can't enumerate another branch's customers by guessing a
// salesman id.
router.get('/:id/customers', authenticate, isAdmin, async (req, res) => {
  try {
    const smParams = { select: 'id,company_id', id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') smParams.company_id = `eq.${req.user.company_id}`;
    const smRows = await pgrestGet('salesmen', smParams);
    if (!smRows?.[0]) return error(res, 'Salesman not found or access denied', 404);

    const data = await pgrestGet('users', {
      select: 'id,full_name,phone,shop_name,rate_tier',
      salesman_id: `eq.${req.params.id}`,
      role: 'eq.customer',
      is_active: 'eq.true',
      order: 'full_name.asc',
    });
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
    const data = await pgrestPatch('salesmen', filter, { full_name, phone: phone != null ? normalizePhone(phone) : phone, position, is_active });
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

// DELETE /api/v1/salesmen/:id/permanent — really removes the salesman:
// their row, login, and their own payments/visits/recoveries/cash closings.
// Customers assigned to them and orders are kept, just unassigned. Separate
// from the soft DELETE /:id above, which the Deactivate button still uses.
router.delete('/:id/permanent', authenticate, isAdmin, async (req, res) => {
  try {
    const smParams = { select: 'id,full_name', id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') smParams.company_id = `eq.${req.user.company_id}`;
    const rows = await pgrestGet('salesmen', smParams);
    if (!rows?.[0]) return error(res, 'Salesman not found or access denied', 404);

    const removed = await deleteSalesmanPermanently(rows[0].id);
    return success(res, { deleted: true, removed }, 'Salesman deleted permanently');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
