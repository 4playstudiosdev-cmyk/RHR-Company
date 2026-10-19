const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole }  = require('../middleware/role.middleware');
const { requireFeature } = require('../middleware/feature.middleware');
const { pgrestGet, pgrestPost } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');

const isFieldOrAdmin = requireRole('salesman', 'branch_admin', 'super_admin');

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const validCoords = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

// Great-circle distance in metres between two lat/lng points.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// POST /api/v1/visits — a salesman marks a customer visit.
//  * visited_at is the SERVER's clock at the moment of the request — the
//    exact date, time and second the visit was marked. The client can no
//    longer back-date it (that made the record worthless as proof).
//  * latitude/longitude/accuracy are the phone's position at that moment,
//    sent by the app without any extra step for the salesman. If the phone
//    couldn't get a fix the visit is still saved, just without a location
//    (the admin panel shows it as "No location").
//  * notes are mandatory — a visit can't be marked done without saying what
//    happened (the app enforces this too, the backend doesn't trust it alone).
router.post('/', authenticate, isFieldOrAdmin, requireFeature({ salesman: 'visits' }), async (req, res) => {
  try {
    const { customer_id, notes, follow_up_date, accuracy } = req.body;
    if (!customer_id) return error(res, 'customer_id is required', 400);
    if (!notes || !notes.trim()) return error(res, 'notes are required to log a visit', 400);

    // The customer must be a real customer of the salesman's own branch.
    const customers = await pgrestGet('users', { select: 'id,company_id', id: `eq.${customer_id}`, role: 'eq.customer' });
    const customer = customers?.[0];
    if (!customer) return error(res, 'Customer not found', 404);
    if (req.user.role !== 'super_admin' && customer.company_id !== req.user.company_id)
      return error(res, 'Customer not found', 404);

    const lat = num(req.body.latitude);
    const lng = num(req.body.longitude);
    const hasLocation = validCoords(lat, lng);
    const acc = num(accuracy);

    const row = {
      company_id:     customer.company_id,
      salesman_id:    req.user.id,
      customer_id,
      notes:          notes.trim(),
      latitude:       hasLocation ? lat : null,
      longitude:      hasLocation ? lng : null,
      follow_up_date: follow_up_date || null,
      visited_at:     new Date().toISOString(),
    };

    let data;
    try {
      // location_accuracy_m is a phase68 column — fall back to the plain
      // row if that migration hasn't been run yet, so marking a visit (and
      // its location) never fails over it.
      [data] = await pgrestPost('customer_visits', {
        ...row,
        location_accuracy_m: hasLocation && Number.isFinite(acc) ? Math.round(acc) : null,
      });
    } catch (e) {
      [data] = await pgrestPost('customer_visits', row);
    }

    return success(res, { ...data, location_captured: hasLocation }, 'Visit logged', 201);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/visits?from=YYYY-MM-DD&to=YYYY-MM-DD&salesman_id=&customer_id=&company_id=
//  salesman: their own visits.
//  branch_admin: their branch. super_admin: one branch (?company_id=) or all.
// Each row carries the salesman, the customer (shop name first) and, when
// both the visit and the customer's shop have coordinates, how far from the
// shop the visit was marked (distance_m).
router.get('/', authenticate, isFieldOrAdmin, async (req, res) => {
  try {
    const { from, to, salesman_id, customer_id } = req.query;
    const params = {
      select: '*,users!customer_id(full_name,shop_name,phone,shop_address,shop_latitude,shop_longitude),salesmen!salesman_id(full_name,phone)',
      order: 'visited_at.desc',
      limit: '2000',
    };

    if (req.user.role === 'salesman') {
      params.salesman_id = `eq.${req.user.id}`;
      params.company_id = `eq.${req.user.company_id}`;
    } else {
      const companyId = resolveCompanyId(req);
      if (companyId) params.company_id = `eq.${companyId}`;
      if (salesman_id) params.salesman_id = `eq.${salesman_id}`;
    }
    if (customer_id) params.customer_id = `eq.${customer_id}`;

    // Dates are the caller's calendar days; Karachi is UTC+5, so a day runs
    // from 19:00 UTC the evening before. Sent as whole-day bounds in UTC
    // with that offset so "today" in the app means today for the salesman.
    const dayStart = (d) => new Date(`${d}T00:00:00+05:00`).toISOString();
    const dayEnd = (d) => new Date(`${d}T23:59:59.999+05:00`).toISOString();
    if (from && to) params.and = `(visited_at.gte.${dayStart(from)},visited_at.lte.${dayEnd(to)})`;
    else if (from) params.visited_at = `gte.${dayStart(from)}`;
    else if (to) params.visited_at = `lte.${dayEnd(to)}`;

    const rows = await pgrestGet('customer_visits', params);

    const data = (rows || []).map((v) => {
      const lat = num(v.latitude);
      const lng = num(v.longitude);
      const has = validCoords(lat, lng);
      const sLat = num(v.users?.shop_latitude);
      const sLng = num(v.users?.shop_longitude);
      return {
        ...v,
        has_location: has,
        distance_m: has && validCoords(sLat, sLng) ? distanceMeters(lat, lng, sLat, sLng) : null,
      };
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
