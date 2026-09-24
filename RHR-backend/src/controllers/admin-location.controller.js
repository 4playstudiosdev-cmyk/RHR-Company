const { success, error } = require('../utils/response');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');

// POST /api/v1/admin-location/ping
// Admin desktop app sends its location while logged in. Routed through
// the raw-https bypass (see utils/directQuery.js) — this was still a
// plain supabaseAdmin insert and hitting the same Railway-only
// RLS-looking write failure documented there (confirmed: the identical
// insert succeeds instantly run locally), which is why this endpoint was
// intermittently 500ing for admins trying to grant location on login.
const pingAdminLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, status } = req.body;

    if (!latitude || !longitude)
      return error(res, 'latitude and longitude are required', 400);

    const [data] = await pgrestPost('admin_locations', {
      company_id:  req.user.company_id,
      user_id:     req.user.id,
      latitude:    Number(latitude),
      longitude:   Number(longitude),
      accuracy:    accuracy || null,
      status:      status || 'active',
      recorded_at: new Date().toISOString()
    });

    return success(res, data, 'Admin location recorded');
  } catch (err) { return error(res, err.message); }
};

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const BRANCH_CITY_NAMES = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': 'Karachi',
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd662267': 'Sukkur',
};

// POST /api/v1/admin-location/skip
// The post-login LocationGate escape hatch — browser location can be
// permanently denied at the OS/browser level with no in-page way to
// re-prompt (only a manual permission change fixes that), so a hard
// block would lock a legitimate admin out of their own account with no
// recovery path. This unlocks the desktop anyway but tells the
// super_admin it happened, so the visibility goal isn't silently lost.
const skipLocationCheck = async (req, res) => {
  try {
    await pgrestPost('notifications', {
      company_id:     KARACHI_COMPANY_ID,
      recipient_role: 'super_admin',
      title:          `${BRANCH_CITY_NAMES[req.user.company_id] || 'An'} Admin — Location Not Shared`,
      body:           `${req.user.full_name} logged in but could not grant location access (denied or unavailable) and continued without it.`,
      type:           'admin_login',
    });
  } catch (e) {
    console.error('[admin-location] skip notification failed:', e.message);
  }
  return success(res, { skipped: true }, 'Continuing without location');
};

// GET /api/v1/admin-location/live
// super_admin sees every admin; a branch_admin sees only their own
// account (never another admin's — company_id can't be used to scope
// this since a branch_admin's own company_id is Karachi's, same as the
// super_admin's, which used to leak the super_admin's live location to
// them). Filtered by user id instead, which is unambiguous either way.
// Routed through the raw-https bypass (see utils/directQuery.js) — plain
// supabaseAdmin reads on this exact shape of query were confirmed to
// silently come back empty on Railway even for real, existing rows.
const getAdminLiveLocations = async (req, res) => {
  try {
    const selfOnly = req.user.role !== 'super_admin';

    const [admins, companies] = await Promise.all([
      pgrestGet('users', {
        select: 'id,full_name,phone,role,company_id',
        role: 'in.(super_admin,branch_admin)',
        is_active: 'eq.true',
        ...(selfOnly ? { id: `eq.${req.user.id}` } : {}),
      }),
      pgrestGet('companies', { select: 'id,name,city' }),
    ]);
    const companyById = Object.fromEntries((companies || []).map(c => [c.id, { name: c.name, city: c.city }]));

    const liveData = await Promise.all((admins || []).map(async (a) => {
      const locRows = await pgrestGet('admin_locations', {
        select: 'latitude,longitude,status,recorded_at',
        user_id: `eq.${a.id}`,
        order: 'recorded_at.desc',
        limit: '1',
      });
      return { ...a, company: companyById[a.company_id] || null, location: locRows?.[0] || null };
    }));

    return success(res, liveData, 'Live admin locations');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/admin-location/history/:adminId
// Today's location history for one admin — super_admin can view anyone;
// a branch_admin can only view their own, same reasoning as
// getAdminLiveLocations above.
const getAdminLocationHistory = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (req.user.role !== 'super_admin' && adminId !== req.user.id)
      return error(res, 'You can only view your own location history', 403);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data = await pgrestGet('admin_locations', {
      select: 'latitude,longitude,status,recorded_at',
      user_id: `eq.${adminId}`,
      recorded_at: `gte.${today.toISOString()}`,
      order: 'recorded_at.asc',
    });

    return success(res, data, 'Admin location history');
  } catch (err) { return error(res, err.message); }
};

module.exports = { pingAdminLocation, skipLocationCheck, getAdminLiveLocations, getAdminLocationHistory };
