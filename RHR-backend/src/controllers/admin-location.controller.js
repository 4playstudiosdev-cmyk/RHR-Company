const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

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
// Latest known location for each admin (super_admin/branch_admin) in the company
const getAdminLiveLocations = async (req, res) => {
  try {
    const companyId = req.user.role === 'super_admin'
      ? req.query.company_id || req.user.company_id
      : req.user.company_id;

    const { data: admins } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, role')
      .eq('company_id', companyId)
      .in('role', ['super_admin', 'branch_admin'])
      .eq('is_active', true);

    const liveData = await Promise.all((admins || []).map(async (a) => {
      const { data: loc } = await supabaseAdmin
        .from('admin_locations')
        .select('latitude, longitude, status, recorded_at')
        .eq('user_id', a.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
      return { ...a, location: loc || null };
    }));

    return success(res, liveData, 'Live admin locations');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/admin-location/history/:adminId
// Today's location history for one admin
const getAdminLocationHistory = async (req, res) => {
  try {
    const { adminId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error: dbErr } = await supabaseAdmin
      .from('admin_locations')
      .select('latitude, longitude, status, recorded_at')
      .eq('user_id', adminId)
      .gte('recorded_at', today.toISOString())
      .order('recorded_at', { ascending: true });

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Admin location history');
  } catch (err) { return error(res, err.message); }
};

module.exports = { pingAdminLocation, getAdminLiveLocations, getAdminLocationHistory };
