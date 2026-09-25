const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');
const { success, error } = require('../utils/response');

const VEHICLE_TYPES = ['delivery', 'pickup', 'motorcycle', 'other'];

// GET /api/v1/vehicles
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: '*', is_active: 'eq.true', order: 'name.asc' };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('vehicles', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/vehicles
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, plate_number, type, company_id } = req.body;
    if (!name || !plate_number)
      return error(res, 'name and plate_number are required', 400);
    if (type && !VEHICLE_TYPES.includes(type))
      return error(res, `type must be one of: ${VEHICLE_TYPES.join(', ')}`, 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const [data] = await pgrestPost('vehicles', {
      company_id: targetCompanyId,
      name,
      plate_number,
      type: type || 'delivery',
    });

    return success(res, data, 'Vehicle added', 201);
  } catch (err) { return error(res, err.message); }
});

// PATCH /api/v1/vehicles/:id — edit details or deactivate
router.patch('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, plate_number, type, is_active } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const body = {};
    if (name !== undefined) body.name = name;
    if (plate_number !== undefined) body.plate_number = plate_number;
    if (type !== undefined) body.type = type;
    if (is_active !== undefined) body.is_active = is_active;

    const data = await pgrestPatch('vehicles', filter, body);
    if (!data?.[0]) return error(res, 'Vehicle not found or access denied', 404);
    return success(res, data[0], 'Vehicle updated');
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/vehicles/report — must be registered before /:id/readings
// so Express doesn't try to match "report" as a vehicle id first.
router.get('/report', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const vehicleParams = { select: '*', is_active: 'eq.true' };
    if (companyId) vehicleParams.company_id = `eq.${companyId}`;
    const vehicles = await pgrestGet('vehicles', vehicleParams);

    const report = await Promise.all((vehicles || []).map(async (v) => {
      // A gte/lte range on the same column needs two query-string entries,
      // which pgrestGet's one-value-per-key params object can't express
      // (same limitation noted in expenses.controller.js) — simplest fix
      // at this scale is fetching all of this vehicle's readings/expenses
      // and filtering the date range client-side below.
      const readings = await pgrestGet('vehicle_meter_readings', {
        select: '*',
        vehicle_id: `eq.${v.id}`,
        order: 'reading_date.asc',
      }).catch(() => []);
      const filteredReadings = (readings || []).filter((r) => {
        if (from && r.reading_date < from) return false;
        if (to && r.reading_date > to) return false;
        return true;
      });
      const totalKm = filteredReadings.reduce((s, r) => s + Number(r.km_driven || 0), 0);

      const expenseParams = { select: '*', vehicle_id: `eq.${v.id}` };
      const expenses = (await pgrestGet('expenses', expenseParams).catch(() => [])) || [];
      const filteredExpenses = expenses.filter((e) => {
        if (from && e.expense_date < from) return false;
        if (to && e.expense_date > to) return false;
        return true;
      });

      const fuelExpenses  = filteredExpenses.filter((e) => e.category === 'Fuel');
      const otherExpenses = filteredExpenses.filter((e) => e.category !== 'Fuel');

      const totalFuelAmt  = fuelExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalFuelLtrs = fuelExpenses.reduce((s, e) => s + Number(e.fuel_liters || 0), 0);
      const totalMaintAmt = otherExpenses.reduce((s, e) => s + Number(e.amount), 0);
      const totalExpenses = totalFuelAmt + totalMaintAmt;

      // Bags delivered is derived from actually-delivered customer
      // orders, not typed in by hand — found via whichever driver(s) are
      // assigned to this vehicle (drivers.vehicle_id, phase32), then
      // summing order_items.quantity for that driver's delivered orders.
      // Filtered by order creation date — orders has no separate
      // delivered-at timestamp to filter on instead.
      const vehicleDrivers = await pgrestGet('drivers', {
        select: 'id',
        vehicle_id: `eq.${v.id}`,
      }).catch(() => []);
      const driverIds = (vehicleDrivers || []).map((d) => d.id);

      let totalBags = 0;
      if (driverIds.length > 0) {
        const deliveredOrders = await pgrestGet('orders', {
          select: 'id,created_at,order_items(quantity)',
          driver_id: `in.(${driverIds.join(',')})`,
          status: 'eq.delivered',
        }).catch(() => []);
        totalBags = (deliveredOrders || [])
          .filter((o) => {
            if (from && o.created_at < from) return false;
            if (to && o.created_at > `${to}T23:59:59`) return false;
            return true;
          })
          .reduce((sum, o) => sum + (o.order_items || []).reduce((s, it) => s + Number(it.quantity || 0), 0), 0);
      }

      const fuelAverage   = totalFuelLtrs > 0 ? Number((totalKm / totalFuelLtrs).toFixed(2)) : 0;
      const perBagExpense = totalBags > 0 ? Number((totalExpenses / totalBags).toFixed(2)) : 0;

      return {
        vehicle: v,
        total_km: totalKm,
        total_fuel_amt: totalFuelAmt,
        total_fuel_ltrs: totalFuelLtrs,
        total_maint_amt: totalMaintAmt,
        total_expenses: totalExpenses,
        total_bags: totalBags,
        fuel_average: fuelAverage,
        per_bag_expense: perBagExpense,
        readings: filteredReadings,
        expenses: filteredExpenses,
      };
    }));

    return success(res, report);
  } catch (err) { return error(res, err.message); }
});

// GET /api/v1/vehicles/:id/readings
router.get('/:id/readings', authenticate, isAdmin, async (req, res) => {
  try {
    const data = await pgrestGet('vehicle_meter_readings', {
      select: '*',
      vehicle_id: `eq.${req.params.id}`,
      order: 'reading_date.desc,created_at.desc',
      limit: '50',
    });
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/vehicles/:id/readings — km_driven is computed here from
// the previous reading, not trusted from the client. reading_type used
// to be a morning/evening choice from the client — now just one reading
// a day ('daily'), so it's no longer client-controlled.
router.post('/:id/readings', authenticate, isAdmin, async (req, res) => {
  try {
    const { reading_date, meter_reading, notes } = req.body;
    if (meter_reading == null || Number(meter_reading) < 0)
      return error(res, 'A valid meter_reading is required', 400);

    const vehicles = await pgrestGet('vehicles', { select: 'id,company_id', id: `eq.${req.params.id}` });
    const vehicle = vehicles?.[0];
    if (!vehicle) return error(res, 'Vehicle not found', 404);
    if (req.user.role !== 'super_admin' && vehicle.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    const prev = await pgrestGet('vehicle_meter_readings', {
      select: 'meter_reading',
      vehicle_id: `eq.${req.params.id}`,
      order: 'reading_date.desc,created_at.desc',
      limit: '1',
    });
    const prevReading = Number(prev?.[0]?.meter_reading || 0);
    const kmDriven = Number(meter_reading) - prevReading;

    const [data] = await pgrestPost('vehicle_meter_readings', {
      company_id: vehicle.company_id,
      vehicle_id: req.params.id,
      reading_date: reading_date || new Date().toISOString().split('T')[0],
      reading_type: 'daily',
      meter_reading: Number(meter_reading),
      km_driven: kmDriven > 0 ? kmDriven : 0,
      notes: notes || null,
      created_by: req.user.id,
    });

    return success(res, { ...data, km_driven: kmDriven > 0 ? kmDriven : 0, prev_reading: prevReading }, 'Reading saved', 201);
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
