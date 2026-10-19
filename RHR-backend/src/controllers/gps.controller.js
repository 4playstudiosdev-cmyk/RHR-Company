const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');

// POST /api/v1/gps/ping
// Salesman/driver sends location every 5s from the Flutter app (background
// tracking, see gps_service.dart). Routed through the pgrestPost raw-https
// bypass (see utils/directQuery.js) — this was still on plain
// supabaseAdmin, the same documented Railway/supabase-js write flakiness
// fixed everywhere else in this codebase. Here it meant an occasional real
// ping from a device with genuine internet still failed server-side, which
// the app correctly treats as "couldn't send" and queues offline — so the
// device looked stuck offline/stale on the admin map even while connected.
const pingLocation = async (req, res) => {
  try {
    const { latitude, longitude, accuracy, status } = req.body;

    if (!latitude || !longitude)
      return error(res, 'latitude and longitude are required', 400);

    const [data] = await pgrestPost('gps_locations', {
      company_id:  req.user.company_id,
      user_id:     req.user.id,
      latitude:    Number(latitude),
      longitude:   Number(longitude),
      accuracy:    accuracy || null,
      status:      status || 'moving',
      recorded_at: new Date().toISOString()
    });

    if (!data) throw new Error('Failed to record location');
    return success(res, data, 'Location recorded');
  } catch (err) { return error(res, err.message); }
};

// ── Time handling ─────────────────────────────────────────────────────
// Everyone using this system is in Pakistan (UTC+5). The server runs in
// UTC, so "a day" must be cut at Pakistan midnight, not UTC midnight —
// otherwise the 00:00–05:00 PKT hours land on the wrong day.
const PKT_OFFSET = '+05:00';
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const pktToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
function pktDayBounds(dateStr) {
  const d = dateRe.test(String(dateStr || '')) ? dateStr : pktToday();
  return {
    date: d,
    start: new Date(`${d}T00:00:00${PKT_OFFSET}`).toISOString(),
    end: new Date(`${d}T23:59:59.999${PKT_OFFSET}`).toISOString(),
  };
}

// A queued offline ping carries the phone's own clock. Older app builds sent
// it as a plain local time with no timezone ("2026-10-17T22:40:33"), which
// Postgres read as UTC — stamping those pings 5 hours in the future. A
// timestamp with no zone is Pakistan time; anything still in the future is
// clamped to now.
function parsePingTime(ts) {
  if (!ts) return new Date().toISOString();
  let str = String(ts).trim();
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(str)) str += PKT_OFFSET;
  const t = new Date(str);
  if (Number.isNaN(t.getTime())) return new Date().toISOString();
  if (t.getTime() > Date.now() + 5 * 60 * 1000) return new Date().toISOString();
  return t.toISOString();
}

// POST /api/v1/gps/batch-ping
// Salesman/driver sends all offline-queued locations at once when
// internet comes back. Same raw-https bypass as pingLocation above.
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
      recorded_at: parsePingTime(p.timestamp)
    }));

    const data = await pgrestPost('gps_locations', records);

    return success(res, {
      uploaded: data?.length || records.length,
      message: `${records.length} offline points uploaded`
    }, 'Batch upload successful');
  } catch (err) { return error(res, err.message); }
};

// companies is small and effectively static — fetched once per request
// rather than joined, so the three staff-table queries below stay simple.
async function companyLookup() {
  const data = await pgrestGet('companies', { select: 'id,name,city' });
  return Object.fromEntries((data || []).map(c => [c.id, { name: c.name, city: c.city }]));
}

// Latest ping for one field-staff member — via the raw-https bypass (see
// directQuery.js): the plain supabaseAdmin version of this exact query
// was confirmed to silently return empty on Railway for real, existing
// staff (2 salesmen + 1 driver in Karachi came back as an empty list).
async function latestPing(userId) {
  const rows = await pgrestGet('gps_locations', {
    select: 'latitude,longitude,status,recorded_at',
    user_id: `eq.${userId}`,
    order: 'recorded_at.desc',
    limit: '1',
  });
  return rows?.[0] || null;
}

// GET /api/v1/gps/live
// super_admin sees every branch's field staff at once ("massive upper
// hand" — the whole company, not a branch switcher); branch_admin only
// ever sees their own branch's salesmen/drivers.
const getLiveLocations = async (req, res) => {
  try {
    const scoped = req.user.role !== 'super_admin';
    const companyFilter = scoped ? { company_id: `eq.${req.user.company_id}` } : {};

    const [salesmen, delivery, drivers, companies] = await Promise.all([
      pgrestGet('salesmen', { select: 'id,full_name,phone,company_id', is_active: 'eq.true', is_approved: 'eq.true', ...companyFilter }),
      pgrestGet('users', { select: 'id,full_name,phone,company_id', role: 'eq.delivery', is_active: 'eq.true', ...companyFilter }),
      pgrestGet('drivers', { select: 'id,full_name,phone,car_number,company_id', is_active: 'eq.true', is_approved: 'eq.true', ...companyFilter }),
      companyLookup(),
    ]);
    const fieldStaff = [
      ...(salesmen || []).map(s => ({ ...s, staffType: 'salesman' })),
      ...(delivery || []).map(s => ({ ...s, staffType: 'delivery' })),
      ...(drivers  || []).map(s => ({ ...s, staffType: 'driver' }))
    ];

    const liveData = await Promise.all(fieldStaff.map(async (s) => ({
      ...s, company: companies[s.company_id] || null, location: await latestPing(s.id)
    })));

    return success(res, liveData, 'Live locations');
  } catch (err) { return error(res, err.message); }
};

// Finds which company a piece of field staff belongs to, checking every
// table that kind of account can live in. Used to gate /route and
// /history below — those take a bare userId with no other context, so
// without this a branch_admin could view any other branch's staff by ID.
async function resolveStaffCompany(userId) {
  for (const table of ['salesmen', 'users', 'drivers']) {
    const rows = await pgrestGet(table, { select: 'company_id', id: `eq.${userId}` });
    if (rows?.[0]) return rows[0].company_id;
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

    const { start } = pktDayBounds();

    const data = await pgrestGet('gps_locations', {
      select: 'latitude,longitude,status,recorded_at',
      user_id: `eq.${userId}`,
      recorded_at: `gte.${start}`,
      order: 'recorded_at.asc',
    });

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

    const { date: targetDate, start, end } = pktDayBounds(date);

    const data = await pgrestGet('gps_locations', {
      select: 'latitude,longitude,status,is_offline,recorded_at',
      user_id: `eq.${userId}`,
      and: `(recorded_at.gte.${start},recorded_at.lte.${end})`,
      order: 'recorded_at.asc',
    });

    // The customer visits this person marked that day, so the admin can see
    // them as points on the route (where, when, which customer). Only
    // salesmen mark visits — for a driver this is simply empty.
    let visits = [];
    try {
      const rows = await pgrestGet('customer_visits', {
        select: 'id,visited_at,notes,latitude,longitude,customer_id,users!customer_id(full_name,shop_name)',
        salesman_id: `eq.${userId}`,
        and: `(visited_at.gte.${start},visited_at.lte.${end})`,
        order: 'visited_at.asc',
      });
      visits = (rows || []).map((v) => ({
        id: v.id,
        visited_at: v.visited_at,
        notes: v.notes,
        latitude: v.latitude,
        longitude: v.longitude,
        customer_id: v.customer_id,
        customer_name: v.users?.shop_name || v.users?.full_name || 'Customer',
        contact_name: v.users?.shop_name ? v.users?.full_name || null : null,
      }));
    } catch (e) { /* visits are an extra — never block the route itself */ }

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
      route: data,
      visits
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
    const customerRows = await pgrestGet('users', {
      select: 'salesman_id,shop_latitude,shop_longitude',
      id: `eq.${req.user.id}`,
    });
    const customer = customerRows?.[0];
    if (!customer) throw new Error('Customer not found');

    if (!customer.salesman_id) {
      return success(res, { assigned: false }, 'No salesman assigned yet');
    }

    const salesmanRows = await pgrestGet('salesmen', {
      select: 'id,full_name,phone',
      id: `eq.${customer.salesman_id}`,
    });
    const salesman = salesmanRows?.[0];
    if (!salesman) {
      return success(res, { assigned: false }, 'Assigned salesman not found');
    }

    const loc = await latestPing(salesman.id);

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

// GET /api/v1/gps/customers
// Every approved customer that has a saved shop location, with the salesman
// (and driver) looking after them — drawn as shop icons on the Live GPS map.
// A branch admin sees their own branch; a super admin sees every branch (the
// map's city filter narrows it on screen).
const getCustomerLocations = async (req, res) => {
  try {
    const scoped = req.user.role !== 'super_admin';
    const cf = scoped ? { company_id: `eq.${req.user.company_id}` } : {};

    const [customers, salesmen, drivers, companies] = await Promise.all([
      pgrestGet('users', {
        select: 'id,full_name,shop_name,phone,shop_address,city,area,company_id,salesman_id,driver_id,shop_latitude,shop_longitude,shop_image_url',
        role: 'eq.customer', is_approved: 'eq.true', ...cf,
      }),
      pgrestGet('salesmen', { select: 'id,full_name,phone', ...cf }),
      pgrestGet('drivers', { select: 'id,full_name', ...cf }),
      companyLookup(),
    ]);
    const salesmanById = Object.fromEntries((salesmen || []).map((s) => [s.id, s]));
    const driverById = Object.fromEntries((drivers || []).map((d) => [d.id, d]));

    const all = customers || [];
    const located = all
      .filter((c) => c.shop_latitude != null && c.shop_longitude != null)
      .map((c) => ({
        id: c.id,
        full_name: c.full_name,
        shop_name: c.shop_name,
        phone: c.phone,
        shop_address: c.shop_address,
        city: c.city,
        area: c.area,
        company_id: c.company_id,
        company: companies[c.company_id] || null,
        latitude: Number(c.shop_latitude),
        longitude: Number(c.shop_longitude),
        shop_image_url: c.shop_image_url || null,
        salesman: salesmanById[c.salesman_id] ? { id: c.salesman_id, full_name: salesmanById[c.salesman_id].full_name, phone: salesmanById[c.salesman_id].phone } : null,
        driver: driverById[c.driver_id] ? { id: c.driver_id, full_name: driverById[c.driver_id].full_name } : null,
      }))
      .sort((a, b) => String(a.shop_name || a.full_name).localeCompare(String(b.shop_name || b.full_name)));

    return success(res, { customers: located, total: all.length, withoutLocation: all.length - located.length }, 'Customer locations');
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  getCustomerLocations,
  pingLocation, batchPingLocation, getLiveLocations, getLocationHistory, getRoute,
  getMySalesmanLocation
};
