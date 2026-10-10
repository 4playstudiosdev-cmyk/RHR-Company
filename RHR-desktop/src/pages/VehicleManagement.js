import React, { useEffect, useState, useCallback } from 'react';
import {
  Car, BarChart3, Plus, Download, User, Trash2, Route,
  AlertTriangle, Wrench, Activity, Wallet
} from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';
import { exportTableToExcel } from './production/exportUtils';

// 'reading' and 'fuel' are intentionally no longer in this list — their
// tab content still exists further down (not deleted, per instructions),
// just unreachable now that Daily Trip Log covers both in one form.
const TABS = [
  { key: 'vehicles', label: 'Vehicles', icon: Car },
  { key: 'trip-log', label: 'Daily Trip Log', icon: Route },
  { key: 'drivers', label: 'Drivers', icon: User },
  { key: 'report', label: 'Report', icon: BarChart3 },
];

const VEHICLE_TYPES = [
  { value: 'delivery', label: 'Delivery Van' },
  { value: 'pickup', label: 'Pickup Truck' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
];

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

const todayISO = () => new Date().toISOString().split('T')[0];
const monthStartISO = () => todayISO().slice(0, 7) + '-01';

const EMPTY_VEHICLE_FORM = { name: '', plate_number: '', type: 'delivery', is_active: true };
const EMPTY_READING_FORM = { vehicle_id: '', reading_date: todayISO(), meter_reading: '', notes: '' };
const EMPTY_FUEL_FORM = { vehicle_id: '', expense_date: todayISO(), amount: '', fuel_price_per_liter: '', fuel_liters: '' };
const EMPTY_DRIVER_FORM = { full_name: '', phone: '', car_number: '', vehicle_id: '' };
const EMPTY_TRIP_FORM = {
  vehicle_id: '', driver_id: '', trip_date: todayISO(), opening_km: '',
  closing_km: '', route: '', fuel_liters: '', fuel_cost: '', notes: ''
};

// > 5000 km since last service: red "Oil Change Due". > 3500: yellow
// "Service Soon". No last_service_odometer on file yet (phase50, not
// every vehicle has one set) → treated as 0 km since service, no alert,
// exactly the fallback the client asked for.
function getMaintenanceInfo(vehicle, extra) {
  const current = extra?.lastOdometer;
  const lastService = vehicle.last_service_odometer != null ? Number(vehicle.last_service_odometer) : null;
  if (current == null || lastService == null) return { level: null, kmSince: 0 };
  const kmSince = Math.max(0, current - lastService);
  if (kmSince > 5000) return { level: 'red', label: 'Oil Change Due', kmSince };
  if (kmSince > 3500) return { level: 'yellow', label: 'Service Soon', kmSince };
  return { level: null, kmSince };
}

// There's no persisted "trip in progress" state in the backend (a trip
// is logged as a single closing reading, not an open/close pair), so
// "In Transit" can't be honestly distinguished from "Returned" — this
// reports what the data actually supports: a reading or fuel expense
// logged today, or idle.
function getTodayStatus(extra) {
  if (extra?.hasReadingToday) return { label: 'Returned', emoji: '✅', classes: 'bg-emerald-50 text-emerald-700' };
  if (extra?.hasFuelToday) return { label: 'Loading', emoji: '⛽', classes: 'bg-blue-50 text-blue-700' };
  return { label: 'Idle', emoji: '⚪', classes: 'bg-gray-100 text-gray-500' };
}

function SummaryCard({ icon: Icon, value, label, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg}`}>
        <Icon size={20} className={color.text} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-navy truncate">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function VehicleManagement() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('vehicles');

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehicleExtras, setVehicleExtras] = useState({}); // id -> { lastOdometer, hasReadingToday, hasFuelToday }

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [plateError, setPlateError] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  // Hidden tabs' state — kept so their components below still work if
  // ever re-enabled, just not reachable from the tab bar.
  const [readingForm, setReadingForm] = useState(EMPTY_READING_FORM);
  const [prevReading, setPrevReading] = useState(null);
  const [savingReading, setSavingReading] = useState(false);
  const [fuelForm, setFuelForm] = useState(EMPTY_FUEL_FORM);
  const [savingFuel, setSavingFuel] = useState(false);

  const [tripForm, setTripForm] = useState(EMPTY_TRIP_FORM);
  const [tripPrevReading, setTripPrevReading] = useState(null);
  const [savingTrip, setSavingTrip] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER_FORM);
  const [savingDriver, setSavingDriver] = useState(false);
  const [deletingDriverId, setDeletingDriverId] = useState(null);

  const [reportFrom, setReportFrom] = useState(monthStartISO());
  const [reportTo, setReportTo] = useState(todayISO());
  const [report, setReport] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRun, setReportRun] = useState(false);
  const [fuelCostMonth, setFuelCostMonth] = useState(0);

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  // Per-vehicle "live" data the base /vehicles list doesn't carry: last
  // odometer reading and whether a reading/fuel expense landed today —
  // drives the Last Odometer, Today's Status and Maintenance Alert
  // columns. Readings are per-vehicle only (no bulk endpoint), so this
  // fans out one request per vehicle; fine at normal fleet sizes.
  const loadVehicleExtras = useCallback(async (vehicleList) => {
    if (vehicleList.length === 0) { setVehicleExtras({}); return; }
    const today = todayISO();
    const [readingsResults, todayExpenses] = await Promise.all([
      Promise.all(vehicleList.map((v) =>
        api.get(`/vehicles/${v.id}/readings`)
          .then((r) => ({ id: v.id, readings: r.data.data || [] }))
          .catch(() => ({ id: v.id, readings: [] }))
      )),
      api.get('/expenses', { params: { from: today, to: today, ...(companyFilter ? { company_id: companyFilter } : {}) } })
        .then((r) => r.data.data || [])
        .catch(() => []),
    ]);

    const extras = {};
    readingsResults.forEach(({ id, readings }) => {
      const last = readings[0];
      extras[id] = {
        lastOdometer: last ? Number(last.meter_reading) : null,
        hasReadingToday: readings.some((r) => r.reading_date === today),
        hasFuelToday: false,
      };
    });
    todayExpenses
      .filter((e) => e.category === 'Fuel' && e.vehicle_id && extras[e.vehicle_id])
      .forEach((e) => { extras[e.vehicle_id].hasFuelToday = true; });

    setVehicleExtras(extras);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFilter]);

  const loadDrivers = async () => {
    setDriversLoading(true);
    try {
      const data = companyFilter
        ? (await api.get('/drivers', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/drivers');
      setDrivers(data);
    } catch (err) {
      toast.error('Failed to load drivers.');
    } finally {
      setDriversLoading(false);
    }
  };

  const handleAddDriver = async (e) => {
    e.preventDefault();
    if (!driverForm.full_name || !driverForm.phone) {
      toast.error('Full name and phone are required.');
      return;
    }
    setSavingDriver(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/drivers', { ...driverForm, company_id: targetCompanyId });
      toast.success('Driver added.');
      setDriverForm(EMPTY_DRIVER_FORM);
      setShowAddDriver(false);
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add driver.');
    } finally {
      setSavingDriver(false);
    }
  };

  const handleAssignDriverVehicle = async (driverId, vehicleId) => {
    try {
      await api.patch(`/drivers/${driverId}`, { vehicle_id: vehicleId || null });
      setDrivers((prev) => prev.map((d) => (d.id === driverId ? { ...d, vehicle_id: vehicleId || null } : d)));
      toast.success(vehicleId ? 'Vehicle assigned.' : 'Vehicle unassigned.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign vehicle.');
    }
  };

  const handleDeleteDriver = async (driver) => {
    if (!window.confirm(`Delete driver "${driver.full_name}"?`)) return;
    setDeletingDriverId(driver.id);
    try {
      await api.delete(`/drivers/${driver.id}`);
      toast.success('Driver deleted.');
      loadDrivers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete driver.');
    } finally {
      setDeletingDriverId(null);
    }
  };

  const loadVehicles = async () => {
    setVehiclesLoading(true);
    try {
      const data = companyFilter
        ? (await api.get('/vehicles', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/vehicles');
      setVehicles(data);
      loadVehicleExtras(data);
      loadFuelCostMonth();
    } catch (err) {
      toast.error('Failed to load vehicles.');
    } finally {
      setVehiclesLoading(false);
    }
  };

  const loadFuelCostMonth = async () => {
    try {
      const params = { from: monthStartISO(), to: todayISO() };
      if (companyFilter) params.company_id = companyFilter;
      const res = await api.get('/expenses', { params });
      const total = (res.data.data || [])
        .filter((e) => e.category === 'Fuel')
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      setFuelCostMonth(total);
    } catch (err) {
      setFuelCostMonth(0);
    }
  };

  const openVehicleModal = () => {
    setVehicleForm(EMPTY_VEHICLE_FORM);
    setPlateError('');
    setShowVehicleModal(true);
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    const plate = vehicleForm.plate_number.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!vehicleForm.name.trim() || !plate) {
      toast.error('Name and plate number are required.');
      return;
    }
    const isDuplicate = vehicles.some((v) => v.plate_number.trim().toUpperCase() === plate);
    if (isDuplicate) {
      setPlateError('This plate number already exists');
      return;
    }
    setPlateError('');
    setSavingVehicle(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/vehicles', { ...vehicleForm, plate_number: plate, company_id: targetCompanyId });
      toast.success('Vehicle added.');
      setVehicleForm(EMPTY_VEHICLE_FORM);
      setShowVehicleModal(false);
      loadVehicles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add vehicle.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const handleMarkServiced = async (vehicle) => {
    const current = vehicleExtras[vehicle.id]?.lastOdometer;
    if (current == null) {
      toast.error('No odometer reading on file yet for this vehicle.');
      return;
    }
    if (!window.confirm(`Mark "${vehicle.name}" as serviced at ${current.toLocaleString()} km?`)) return;
    try {
      await api.patch(`/vehicles/${vehicle.id}`, { last_service_odometer: current });
      toast.success('Marked as serviced — maintenance alert reset.');
      loadVehicles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update.');
    }
  };

  const loadPrevReading = async (vehicleId) => {
    if (!vehicleId) { setPrevReading(null); return; }
    try {
      const res = await api.get(`/vehicles/${vehicleId}/readings`);
      setPrevReading(res.data.data?.[0]?.meter_reading ?? null);
    } catch (err) {
      setPrevReading(null);
    }
  };

  const kmDriven = prevReading != null && readingForm.meter_reading
    ? Number(readingForm.meter_reading) - Number(prevReading)
    : null;

  const handleAddReading = async (e) => {
    e.preventDefault();
    if (!readingForm.vehicle_id || !readingForm.meter_reading) {
      toast.error('Select a vehicle and enter the meter reading.');
      return;
    }
    setSavingReading(true);
    try {
      const res = await api.post(`/vehicles/${readingForm.vehicle_id}/readings`, readingForm);
      toast.success(`Reading saved — ${res.data.data.km_driven} km driven.`);
      setReadingForm({ ...EMPTY_READING_FORM, vehicle_id: readingForm.vehicle_id });
      loadPrevReading(readingForm.vehicle_id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save reading.');
    } finally {
      setSavingReading(false);
    }
  };

  const updateFuelField = (field, value) => {
    const updated = { ...fuelForm, [field]: value };
    if (updated.amount && updated.fuel_price_per_liter) {
      updated.fuel_liters = (Number(updated.amount) / Number(updated.fuel_price_per_liter)).toFixed(2);
    }
    setFuelForm(updated);
  };

  const handleAddFuelExpense = async (e) => {
    e.preventDefault();
    if (!fuelForm.vehicle_id || !fuelForm.amount || Number(fuelForm.amount) <= 0) {
      toast.error('Select a vehicle and enter a valid amount.');
      return;
    }
    setSavingFuel(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      const vehicle = vehicles.find((v) => v.id === fuelForm.vehicle_id);
      await api.post('/expenses', {
        company_id: targetCompanyId,
        category: 'Fuel',
        amount: Number(fuelForm.amount),
        description: `Fuel — ${vehicle?.name || 'vehicle'}${fuelForm.fuel_liters ? ` (${fuelForm.fuel_liters} L)` : ''}`,
        expense_date: fuelForm.expense_date,
        method: 'cash',
        vehicle_id: fuelForm.vehicle_id,
        fuel_price_per_liter: fuelForm.fuel_price_per_liter || null,
        fuel_liters: fuelForm.fuel_liters || null,
      });
      toast.success('Fuel expense recorded.');
      setFuelForm({ ...EMPTY_FUEL_FORM, vehicle_id: fuelForm.vehicle_id });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record fuel expense.');
    } finally {
      setSavingFuel(false);
    }
  };

  // ── Daily Trip Log (merges Meter Reading + Fuel & Expenses into one
  // entry) — saves to the same two existing endpoints those tabs always
  // used, just from one form. Opening KM is read-only, sourced from the
  // vehicle's last recorded reading, so the saved distance always
  // matches what the backend itself computes server-side.
  const loadTripPrevReading = async (vehicleId) => {
    if (!vehicleId) { setTripPrevReading(null); return; }
    try {
      const res = await api.get(`/vehicles/${vehicleId}/readings`);
      setTripPrevReading(res.data.data?.[0]?.meter_reading ?? null);
    } catch (err) {
      setTripPrevReading(null);
    }
  };

  const tripDistance = tripPrevReading != null && tripForm.closing_km
    ? Number(tripForm.closing_km) - Number(tripPrevReading)
    : null;
  const tripEfficiency = tripDistance != null && tripDistance > 0 && tripForm.fuel_liters
    ? Number((tripDistance / Number(tripForm.fuel_liters)).toFixed(2))
    : null;

  const handleSaveTrip = async (e) => {
    e.preventDefault();
    if (!tripForm.vehicle_id || !tripForm.closing_km) {
      toast.error('Select a vehicle and enter the closing KM.');
      return;
    }
    setSavingTrip(true);
    try {
      const driver = drivers.find((d) => d.id === tripForm.driver_id);
      const noteParts = [];
      if (driver) noteParts.push(`Driver: ${driver.full_name}`);
      if (tripForm.route.trim()) noteParts.push(`Route: ${tripForm.route.trim()}`);
      if (tripForm.notes.trim()) noteParts.push(tripForm.notes.trim());

      const readingRes = await api.post(`/vehicles/${tripForm.vehicle_id}/readings`, {
        reading_date: tripForm.trip_date,
        meter_reading: tripForm.closing_km,
        notes: noteParts.join(' — ') || null,
      });

      if (tripForm.fuel_cost && Number(tripForm.fuel_cost) > 0) {
        const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
        const vehicle = vehicles.find((v) => v.id === tripForm.vehicle_id);
        const pricePerLiter = tripForm.fuel_liters
          ? (Number(tripForm.fuel_cost) / Number(tripForm.fuel_liters)).toFixed(2)
          : null;
        await api.post('/expenses', {
          company_id: targetCompanyId,
          category: 'Fuel',
          amount: Number(tripForm.fuel_cost),
          description: `Fuel — ${vehicle?.name || 'vehicle'}${tripForm.fuel_liters ? ` (${tripForm.fuel_liters} L)` : ''}`,
          expense_date: tripForm.trip_date,
          method: 'cash',
          vehicle_id: tripForm.vehicle_id,
          fuel_price_per_liter: pricePerLiter,
          fuel_liters: tripForm.fuel_liters || null,
        });
      }

      toast.success(`Trip log saved — ${readingRes.data.data.km_driven} km driven.`);
      setTripForm({ ...EMPTY_TRIP_FORM, vehicle_id: tripForm.vehicle_id });
      loadTripPrevReading(tripForm.vehicle_id);
      loadVehicles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save trip log.');
    } finally {
      setSavingTrip(false);
    }
  };

  const loadReport = async () => {
    setReportLoading(true);
    setReportRun(true);
    try {
      const params = { from: reportFrom, to: reportTo };
      if (companyFilter) params.company_id = companyFilter;
      const res = await api.get('/vehicles/report', { params });
      setReport(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load report.');
    } finally {
      setReportLoading(false);
    }
  };

  const exportReport = () => {
    if (report.length === 0) { toast.error('No report data to export.'); return; }
    exportTableToExcel({
      sheetName: 'Vehicle Report',
      head: ['Vehicle', 'Plate', 'Total KM', 'Fuel Amount (PKR)', 'Fuel Liters', 'Fuel Average (km/L)', 'Maintenance (PKR)', 'Total Expense (PKR)', 'Bags Delivered', 'Per Bag Expense (PKR)'],
      rows: report.map((r) => [
        r.vehicle.name, r.vehicle.plate_number, r.total_km, r.total_fuel_amt,
        r.total_fuel_ltrs, r.fuel_average, r.total_maint_amt, r.total_expenses,
        r.total_bags, r.per_bag_expense,
      ]),
      filename: `vehicle-report-${reportFrom}-to-${reportTo}`,
    });
  };

  const activeVehicles = vehicles.filter((v) => v.is_active !== false);
  const activeTodayCount = vehicles.filter((v) => {
    const ex = vehicleExtras[v.id];
    return ex && (ex.hasReadingToday || ex.hasFuelToday);
  }).length;
  const maintenanceDueCount = vehicles.filter((v) => getMaintenanceInfo(v, vehicleExtras[v.id]).level === 'red').length;

  return (
    <div className="p-6">
      <PageHeader
        title="Vehicle Management"
        subtitle="Track meter readings, fuel, expenses and delivery performance"
        action={<CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'vehicles' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="accent" onClick={openVehicleModal} className="flex items-center gap-2">
              <Plus size={15} /> Add Vehicle
            </Button>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {vehiclesLoading ? (
              <SkeletonTable rows={5} cols={4} />
            ) : vehicles.length === 0 ? (
              <EmptyState icon={Car} title="No vehicles added yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Vehicle</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Plate Number</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Assigned Driver</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Today's Status</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Last Odometer</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Maintenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v, i) => {
                      const extra = vehicleExtras[v.id];
                      const driver = drivers.find((d) => d.vehicle_id === v.id);
                      const status = getTodayStatus(extra);
                      const maint = getMaintenanceInfo(v, extra);
                      const rowClasses = maint.level === 'red'
                        ? 'bg-red-50 border-l-4 border-red-500'
                        : maint.level === 'yellow'
                        ? 'bg-yellow-50 border-l-4 border-yellow-400'
                        : `border-l-4 border-transparent ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`;
                      return (
                        <tr key={v.id} className={`border-b border-gray-50 last:border-0 ${rowClasses}`}>
                          <td className="px-6 py-3.5 font-medium text-navy">
                            <div className="flex items-center gap-1.5">
                              {v.name}
                              {maint.level === 'red' && <span title="Oil Change Due">🔴</span>}
                              {maint.level === 'yellow' && <span title="Service Soon">🟡</span>}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-gray-600">{v.plate_number}</td>
                          <td className="px-6 py-3.5 text-gray-600 capitalize">{v.type}</td>
                          <td className="px-6 py-3.5 text-gray-600">
                            {driver ? driver.full_name : <span className="text-gray-400">Unassigned</span>}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${status.classes}`}>
                              {status.emoji} {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-gray-600">
                            {extra?.lastOdometer != null ? `${extra.lastOdometer.toLocaleString()} km` : '—'}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              v.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {v.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            {maint.level ? (
                              <button
                                onClick={() => handleMarkServiced(v)}
                                title={`${maint.label} — ${maint.kmSince.toLocaleString()} km since last service. Click to mark serviced.`}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-navy"
                              >
                                <Wrench size={13} /> Mark Serviced
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showVehicleModal && (
        <Modal title="Add Vehicle" onClose={() => setShowVehicleModal(false)}>
          <form onSubmit={handleAddVehicle} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle Name *</label>
              <input
                type="text"
                value={vehicleForm.name}
                onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                placeholder="e.g. Delivery Van 1"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plate Number *</label>
              <input
                type="text"
                value={vehicleForm.plate_number}
                onChange={(e) => { setVehicleForm({ ...vehicleForm, plate_number: e.target.value.toUpperCase() }); setPlateError(''); }}
                placeholder="e.g. KHI-1234"
                className={`w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 transition-shadow ${
                  plateError ? 'border-red-400 focus:ring-red-300 focus:border-red-400' : 'border-gray-300 focus:ring-navy focus:border-navy'
                }`}
              />
              {plateError && <p className="text-xs text-red-600 mt-1">{plateError}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={vehicleForm.type}
                onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={vehicleForm.is_active ? 'active' : 'inactive'}
                onChange={(e) => setVehicleForm({ ...vehicleForm, is_active: e.target.value === 'active' })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowVehicleModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={savingVehicle}>{savingVehicle ? 'Saving...' : 'Add Vehicle'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {tab === 'trip-log' && (
        <form onSubmit={handleSaveTrip} className="max-w-lg bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-navy text-sm">Daily Trip Log</h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle *</label>
            <select
              value={tripForm.vehicle_id}
              onChange={(e) => { setTripForm({ ...tripForm, vehicle_id: e.target.value }); loadTripPrevReading(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="">— Select Vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Driver</label>
            <select
              value={tripForm.driver_id}
              onChange={(e) => setTripForm({ ...tripForm, driver_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="">— None —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Trip Date</label>
            <input
              type="date"
              value={tripForm.trip_date}
              onChange={(e) => setTripForm({ ...tripForm, trip_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Opening KM</label>
            <input
              type="text"
              readOnly
              value={tripPrevReading != null ? `${Number(tripPrevReading).toLocaleString()} km (last recorded reading)` : 'No previous reading on file'}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Closing KM *</label>
            <input
              type="number"
              min="0"
              value={tripForm.closing_km}
              onChange={(e) => setTripForm({ ...tripForm, closing_km: e.target.value })}
              placeholder="Enter closing meter reading"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          {tripDistance != null && tripDistance >= 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-emerald-700">Distance Covered:</span>
              <span className="font-bold text-emerald-700 text-base">{tripDistance} km</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Route</label>
            <input
              type="text"
              value={tripForm.route}
              onChange={(e) => setTripForm({ ...tripForm, route: e.target.value })}
              placeholder="e.g. KHI → SUK"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fuel Added (Liters)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tripForm.fuel_liters}
                onChange={(e) => setTripForm({ ...tripForm, fuel_liters: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fuel Cost (PKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tripForm.fuel_cost}
                onChange={(e) => setTripForm({ ...tripForm, fuel_cost: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
          </div>

          {tripEfficiency != null && (
            <div className={`rounded-lg px-3.5 py-2.5 border ${
              tripEfficiency < 8 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${tripEfficiency < 8 ? 'text-red-700' : 'text-emerald-700'}`}>Fuel Efficiency:</span>
                <span className={`font-bold text-base ${tripEfficiency < 8 ? 'text-red-700' : 'text-emerald-700'}`}>{tripEfficiency} km/liter</span>
              </div>
              {tripEfficiency < 8 && (
                <p className="text-xs text-red-600 mt-1 font-medium">⚠️ Below average fuel efficiency</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={tripForm.notes}
              onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <Button type="submit" variant="accent" disabled={savingTrip} className="w-full">
            {savingTrip ? 'Saving...' : 'Save Trip Log'}
          </Button>
        </form>
      )}

      {tab === 'reading' && (
        <form onSubmit={handleAddReading} className="max-w-lg bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-navy text-sm">Add Meter Reading</h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle *</label>
            <select
              value={readingForm.vehicle_id}
              onChange={(e) => { setReadingForm({ ...readingForm, vehicle_id: e.target.value }); loadPrevReading(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="">— Select Vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>
              ))}
            </select>
          </div>

          {prevReading != null && (
            <div className="bg-navy-chip/40 border border-navy-chip rounded-lg px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-600">Previous Reading:</span>
              <span className="font-bold text-navy text-sm">{Number(prevReading).toLocaleString()} km</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Meter Reading (km) *</label>
            <input
              type="number"
              min="0"
              value={readingForm.meter_reading}
              onChange={(e) => setReadingForm({ ...readingForm, meter_reading: e.target.value })}
              placeholder="Enter current reading"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          {kmDriven != null && kmDriven >= 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-emerald-700">KM Driven:</span>
              <span className="font-bold text-emerald-700 text-base">{kmDriven} km</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={readingForm.reading_date}
              onChange={(e) => setReadingForm({ ...readingForm, reading_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input
              type="text"
              value={readingForm.notes}
              onChange={(e) => setReadingForm({ ...readingForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <Button type="submit" variant="accent" disabled={savingReading} className="w-full">
            {savingReading ? 'Saving...' : 'Save Reading'}
          </Button>
        </form>
      )}

      {tab === 'fuel' && (
        <form onSubmit={handleAddFuelExpense} className="max-w-lg bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-navy text-sm">Add Fuel Expense</h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle *</label>
            <select
              value={fuelForm.vehicle_id}
              onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="">— Select Vehicle —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={fuelForm.expense_date}
              onChange={(e) => setFuelForm({ ...fuelForm, expense_date: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount (PKR) *</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={fuelForm.amount}
              onChange={(e) => updateFuelField('amount', e.target.value)}
              placeholder="e.g. 5000"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fuel Price per Liter (PKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fuelForm.fuel_price_per_liter}
              onChange={(e) => updateFuelField('fuel_price_per_liter', e.target.value)}
              placeholder="e.g. 280"
              className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          {fuelForm.fuel_liters && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs text-emerald-700">Fuel Quantity:</span>
              <span className="font-bold text-emerald-700 text-base">{fuelForm.fuel_liters} Liters</span>
            </div>
          )}

          <Button type="submit" variant="accent" disabled={savingFuel} className="w-full">
            {savingFuel ? 'Saving...' : 'Save Fuel Expense'}
          </Button>
        </form>
      )}

      {tab === 'drivers' && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h3 className="font-semibold text-navy text-sm">Drivers ({drivers.length})</h3>
            <Button variant="accent" onClick={() => setShowAddDriver(true)} className="flex items-center gap-2">
              <Plus size={15} /> Add Driver
            </Button>
          </div>

          {showAddDriver && (
            <form onSubmit={handleAddDriver} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-5 space-y-3">
              <h4 className="font-semibold text-navy text-sm">Add New Driver</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={driverForm.full_name}
                    onChange={(e) => setDriverForm({ ...driverForm, full_name: e.target.value })}
                    placeholder="Driver name"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="text"
                    value={driverForm.phone}
                    onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                    placeholder="03001234567"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Car Number</label>
                  <input
                    type="text"
                    value={driverForm.car_number}
                    onChange={(e) => setDriverForm({ ...driverForm, car_number: e.target.value })}
                    placeholder="KHI-1234"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle (optional)</label>
                  <select
                    value={driverForm.vehicle_id}
                    onChange={(e) => setDriverForm({ ...driverForm, vehicle_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                  >
                    <option value="">— None —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowAddDriver(false)}>Cancel</Button>
                <Button type="submit" variant="accent" disabled={savingDriver}>{savingDriver ? 'Saving...' : 'Save Driver'}</Button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {driversLoading ? (
              <SkeletonTable rows={5} cols={5} />
            ) : drivers.length === 0 ? (
              <EmptyState icon={User} title="No drivers added yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Car Number</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Vehicle</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((d, i) => (
                      <tr key={d.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">{d.full_name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{d.phone || '—'}</td>
                        <td className="px-6 py-3.5 text-gray-600">{d.car_number || '—'}</td>
                        <td className="px-6 py-3.5">
                          <select
                            value={d.vehicle_id || ''}
                            onChange={(e) => handleAssignDriverVehicle(d.id, e.target.value)}
                            className="border border-gray-200 rounded-md px-1.5 py-1 text-[11px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-navy-chip focus:border-navy bg-white cursor-pointer max-w-[150px]"
                          >
                            <option value="">— None —</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>{v.name} ({v.plate_number})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Active</span>
                        </td>
                        <td className="px-6 py-3.5">
                          <button
                            onClick={() => handleDeleteDriver(d)}
                            disabled={deletingDriverId === d.id}
                            className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline font-medium disabled:opacity-50"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard icon={Car} value={activeVehicles.length} label="Total Vehicles" color={{ bg: 'bg-navy-chip', text: 'text-navy' }} />
            <SummaryCard icon={Activity} value={activeTodayCount} label="Active Today" color={{ bg: 'bg-blue-50', text: 'text-blue-600' }} />
            <SummaryCard icon={AlertTriangle} value={maintenanceDueCount} label="Maintenance Due" color={{ bg: 'bg-red-50', text: 'text-red-600' }} />
            <SummaryCard icon={Wallet} value={`PKR ${fuelCostMonth.toLocaleString()}`} label="Fuel Cost This Month" color={{ bg: 'bg-orange/10', text: 'text-orange' }} />
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-5 flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <Button variant="accent" onClick={loadReport} disabled={reportLoading} className="flex items-center gap-2">
              <BarChart3 size={15} /> {reportLoading ? 'Generating...' : 'Generate Report'}
            </Button>
            {report.length > 0 && (
              <button
                onClick={exportReport}
                className="flex items-center gap-1.5 border border-gray-200 text-navy hover:bg-gray-50 text-sm font-medium px-3.5 py-2.5 rounded-lg transition-colors"
              >
                <Download size={15} /> Export Excel
              </button>
            )}
          </div>

          {reportLoading ? (
            <SkeletonTable rows={4} cols={4} />
          ) : !reportRun ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={BarChart3} title="Generate a report to see vehicle data" />
            </div>
          ) : report.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={Car} title="No vehicles found for this period" />
            </div>
          ) : (
            <div className="space-y-5">
              {report.map((r) => {
                const stats = [
                  { label: 'Total KM', value: `${Number(r.total_km).toLocaleString()} km`, color: 'text-navy' },
                  { label: 'Fuel Amount', value: `PKR ${Number(r.total_fuel_amt).toLocaleString()}`, color: 'text-orange' },
                  { label: 'Fuel Liters', value: `${r.total_fuel_ltrs} L`, color: 'text-orange' },
                  { label: 'Fuel Average', value: `${r.fuel_average} km/L`, color: 'text-emerald-600' },
                  { label: 'Maintenance', value: `PKR ${Number(r.total_maint_amt).toLocaleString()}`, color: 'text-red-600' },
                  { label: 'Total Expenses', value: `PKR ${Number(r.total_expenses).toLocaleString()}`, color: 'text-red-600' },
                  { label: 'Bags Delivered', value: `${r.total_bags} bags`, color: 'text-navy' },
                  { label: 'Per Bag Expense', value: `PKR ${r.per_bag_expense}`, color: 'text-emerald-600' },
                ];
                return (
                  <div key={r.vehicle.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
                    <div className="bg-navy px-6 py-4">
                      <h3 className="text-white font-semibold text-sm">{r.vehicle.name}</h3>
                      <p className="text-blue-200/70 text-xs mt-0.5">{r.vehicle.plate_number} · {r.vehicle.type}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100">
                      {stats.map((s) => (
                        <div key={s.label} className="px-5 py-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{s.label}</p>
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
