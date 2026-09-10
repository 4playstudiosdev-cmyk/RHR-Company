const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { pgrestGet } = require('../utils/directQuery');

// POST /api/v1/admin-location/ping
// Admin desktop app sends its location while logged in
const pingAdminLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, status } = req.body;

    if (!latitude || !longitude)
      return error(res, 'latitude and longitude are required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('admin_locations')
      .insert({
        company_id:  req.user.company_id,
        user_id:     req.user.id,
        latitude:    Number(latitude),
        longitude:   Number(longitude),
        accuracy:    accuracy || null,
        status:      status || 'active',
        recorded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Admin location recorded');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/admin-location/live
// super_admin sees every branch's admins at once; branch_admin only ever
// sees admins in their own branch (which in practice is just themselves).
// Routed through the raw-https bypass (see utils/directQuery.js) — plain
// supabaseAdmin reads on this exact shape of query were confirmed to
// silently come back empty on Railway even for real, existing rows.
const getAdminLiveLocations = async (req, res) => {
  try {
    const companyFilter = req.user.role !== 'super_admin' ? { company_id: `eq.${req.user.company_id}` } : {};

    const [admins, companies] = await Promise.all([
      pgrestGet('users', {
        select: 'id,full_name,phone,role,company_id',
        role: 'in.(super_admin,branch_admin)',
        is_active: 'eq.true',
        ...companyFilter,
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
// Today's location history for one admin
const getAdminLocationHistory = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (req.user.role !== 'super_admin') {
      const targetRows = await pgrestGet('users', { select: 'company_id', id: `eq.${adminId}` });
      const target = targetRows?.[0];
      if (!target || target.company_id !== req.user.company_id)
        return error(res, 'Access denied — that admin is not in your branch', 403);
    }

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

module.exports = { pingAdminLocation, getAdminLiveLocations, getAdminLocationHistory };
