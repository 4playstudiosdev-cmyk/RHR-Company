const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

// POST /api/v1/gps/ping
// Salesman sends location every 2 minutes from Flutter app
const pingLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, status } = req.body;

    if (!latitude || !longitude)
      return error(res, 'latitude and longitude are required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('gps_locations')
      .insert({
        company_id:  req.user.company_id,
        user_id:     req.user.id,
        latitude:    Number(latitude),
        longitude:   Number(longitude),
        accuracy:    accuracy || null,
        status:      status || 'moving',
        recorded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Location recorded');
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/gps/batch-ping
// Salesman sends all offline stored locations at once when internet comes back
const batchPingLocation = async (req, res) => {
  try {
    const { pings } = req.body;
    if (!pings || !Array.isArray(pings) || pings.length === 0)
      return error(res, 'pings array is required', 400);

    const records = pings.map(p => ({
      company_id:  req.user.company_id,
      user_id:     req.user.id,
      latitude:    Number(p.latitude),
      longitude:   Number(p.longitude),
      accuracy:    p.accuracy || null,
      status:      p.status || 'moving',
      is_offline:  true,
      recorded_at: p.timestamp || new Date().toISOString()
    }));

    const { data, error: dbErr } = await supabaseAdmin
      .from('gps_locations')
      .insert(records)
      .select();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, {
      uploaded: records.length,
      message: `${records.length} offline points uploaded`
    }, 'Batch upload successful');
  } catch (err) { return error(res, err.message); }
};

// companies is small and effectively static — fetched once per request
// rather than joined, so the three staff-table queries below stay simple.
async function companyLookup() {
  const { data } = await supabaseAdmin.from('companies').select('id, name, city');
  return Object.fromEntries((data || []).map(c => [c.id, { name: c.name, city: c.city }]));
}

// GET /api/v1/gps/live
// super_admin sees every branch's field staff at once ("massive upper
// hand" — the whole company, not a branch switcher); branch_admin only
// ever sees their own branch's salesmen/drivers.
const getLiveLocations = async (req, res) => {
  try {
    const scoped = req.user.role !== 'super_admin';

    let salesmenQ = supabaseAdmin.from('salesmen').select('id, full_name, phone, company_id').eq('is_active', true).eq('is_approved', true);
    let deliveryQ = supabaseAdmin.from('users').select('id, full_name, phone, company_id').eq('role', 'delivery').eq('is_active', true);
    let driversQ  = supabaseAdmin.from('drivers').select('id, full_name, phone, car_number, company_id').eq('is_active', true).eq('is_approved', true);
    if (scoped) {
      salesmenQ = salesmenQ.eq('company_id', req.user.company_id);
      deliveryQ = deliveryQ.eq('company_id', req.user.company_id);
      driversQ  = driversQ.eq('company_id', req.user.company_id);
    }

    const [{ data: salesmen }, { data: delivery }, { data: drivers }, companies] = await Promise.all([
      salesmenQ, deliveryQ, driversQ, companyLookup()
    ]);
    const fieldStaff = [
      ...(salesmen || []).map(s => ({ ...s, staffType: 'salesman' })),
      ...(delivery || []).map(s => ({ ...s, staffType: 'delivery' })),
      ...(drivers  || []).map(s => ({ ...s, staffType: 'driver' }))
    ];

    // Get latest ping for each field staff member
    const liveData = await Promise.all(fieldStaff.map(async (s) => {
      const { data: loc } = await supabaseAdmin
        .from('gps_locations')
        .select('latitude, longitude, status, recorded_at')
        .eq('user_id', s.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
      return { ...s, company: companies[s.company_id] || null, location: loc || null };
    }));

    return success(res, liveData, 'Live locations');
  } catch (err) { return error(res, err.message); }
};

// Finds which company a piece of field staff belongs to, checking every
// table that kind of account can live in. Used to gate /route and
// /history below — those take a bare userId with no other context, so
// without this a branch_admin could view any other branch's staff by ID.
async function resolveStaffCompany(userId) {
  for (const table of ['salesmen', 'users', 'drivers']) {
    const { data } = await supabaseAdmin.from(table).select('company_id').eq('id', userId).maybeSingle();
    if (data) return data.company_id;
  }
  return null;
}

// GET /api/v1/gps/history/:userId
// Today's location history for one salesman
const getLocationHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.role !== 'super_admin') {
      const staffCompanyId = await resolveStaffCompany(userId);
      if (staffCompanyId !== req.user.company_id)
        return error(res, 'Access denied — that staff member is not in your branch', 403);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error: dbErr } = await supabaseAdmin
      .from('gps_locations')
      .select('latitude, longitude, status, recorded_at')
      .eq('user_id', userId)
      .gte('recorded_at', today.toISOString())
      .order('recorded_at', { ascending: true });

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Location history');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/gps/route/:userId
// Returns complete route for a salesman for today or specific date
const getRoute = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    if (req.user.role !== 'super_admin') {
      const staffCompanyId = await resolveStaffCompany(userId);
      if (staffCompanyId !== req.user.company_id)
        return error(res, 'Access denied — that staff member is not in your branch', 403);
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error: dbErr } = await supabaseAdmin
      .from('gps_locations')
      .select('latitude, longitude, status, is_offline, recorded_at')
      .eq('user_id', userId)
      .gte('recorded_at', startOfDay.toISOString())
      .lte('recorded_at', endOfDay.toISOString())
      .order('recorded_at', { ascending: true });

    if (dbErr) throw new Error(dbErr.message);

    // Calculate total distance in KM
    let totalKM = 0;
    for (let i = 1; i < data.length; i++) {
      totalKM += haversineDistance(
        data[i-1].latitude, data[i-1].longitude,
        data[i].latitude,   data[i].longitude
      );
    }

    return success(res, {
      userId,
      date: targetDate,
      totalPoints: data.length,
      totalKM: totalKM.toFixed(2),
      route: data
    }, 'Route data');
  } catch (err) { return error(res, err.message); }
};

// Haversine formula — calculates distance between 2 GPS points in KM
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Assumed average speed for the ETA estimate below. This is a straight-line
// (Haversine) distance divided by a flat speed — NOT real routing/traffic —
// there's no routing API configured for this project. Good enough for a
// rough "salesman is ~12 min away" indicator, not turn-by-turn navigation.
const ASSUMED_SPEED_KMH = 25;

// GET /api/v1/gps/my-salesman
// Customer-only: where their assigned salesman currently is, and a rough
// distance/ETA if the customer has set their own shop location.
const getMySalesmanLocation = async (req, res) => {
  try {
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('users')
      .select('salesman_id, shop_latitude, shop_longitude')
      .eq('id', req.user.id)
      .single();
    if (custErr) throw new Error(custErr.message);

    if (!customer.salesman_id) {
      return success(res, { assigned: false }, 'No salesman assigned yet');
    }

    const { data: salesman, error: salesmanErr } = await supabaseAdmin
      .from('salesmen')
      .select('id, full_name, phone')
      .eq('id', customer.salesman_id)
      .single();
    if (salesmanErr || !salesman) {
      return success(res, { assigned: false }, 'Assigned salesman not found');
    }

    const { data: loc } = await supabaseAdmin
      .from('gps_locations')
      .select('latitude, longitude, status, recorded_at')
      .eq('user_id', salesman.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    let distanceKm = null;
    let etaMinutes = null;
    const hasShopLocation = customer.shop_latitude != null && customer.shop_longitude != null;
    if (loc && hasShopLocation) {
      distanceKm = haversineDistance(
        customer.shop_latitude, customer.shop_longitude,
        loc.latitude, loc.longitude
      );
      etaMinutes = (distanceKm / ASSUMED_SPEED_KMH) * 60;
    }

    return success(res, {
      assigned: true,
      salesman,
      location: loc || null,
      shopLocation: hasShopLocation ? { latitude: customer.shop_latitude, longitude: customer.shop_longitude } : null,
      distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
      etaMinutes: etaMinutes != null ? Math.round(etaMinutes) : null
    }, 'Salesman location');
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  pingLocation, batchPingLocation, getLiveLocations, getLocationHistory, getRoute,
  getMySalesmanLocation
};
