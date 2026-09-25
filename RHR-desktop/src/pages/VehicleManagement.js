import React, { useEffect, useState } from 'react';
import { Car, Gauge, Fuel, BarChart3, Plus, Download, User, Trash2 } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';
import { exportTableToExcel } from './production/exportUtils';

const TABS = [
  { key: 'vehicles', label: 'Vehicles', icon: Car },
  { key: 'reading', label: 'Meter Reading', icon: Gauge },
  { key: 'fuel', label: 'Fuel & Expenses', icon: Fuel },
  { key: 'drivers', label: 'Drivers', icon: User },
  { key: 'report', label: 'Report', icon: BarChart3 },
];

const VEHICLE_TYPES = [
  { value: 'delivery', label: 'Delivery Van' },
  { value: 'pickup', label: 'Pickup Truck' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
];

const todayISO = () => new Date().toISOString().split('T')[0];
const monthStartISO = () => todayISO().slice(0, 7) + '-01';

const EMPTY_VEHICLE_FORM = { name: '', plate_number: '', type: 'delivery' };
const EMPTY_READING_FORM = { vehicle_id: '', reading_date: todayISO(), meter_reading: '', notes: '' };
const EMPTY_FUEL_FORM = { vehicle_id: '', expense_date: todayISO(), amount: '', fuel_price_per_liter: '', fuel_liters: '' };
const EMPTY_DRIVER_FORM = { full_name: '', phone: '', car_number: '', vehicle_id: '' };

export default function VehicleManagement() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('vehicles');

  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [savingVehicle, setSavingVehicle] = useState(false);

  const [readingForm, setReadingForm] = useState(EMPTY_READING_FORM);
  const [prevReading, setPrevReading] = useState(null);
  const [savingReading, setSavingReading] = useState(false);

  const [fuelForm, setFuelForm] = useState(EMPTY_FUEL_FORM);
  const [savingFuel, setSavingFuel] = useState(false);

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

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  useEffect(() => {
    loadVehicles();
    loadDrivers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

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
      const targetCompanyId = selectedCity === 'all' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : selectedCity;
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
    } catch (err) {
      toast.error('Failed to load vehicles.');
    } finally {
      setVehiclesLoading(false);
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!vehicleForm.name || !vehicleForm.plate_number) {
      toast.error('Name and plate number are required.');
      return;
    }
    setSavingVehicle(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : selectedCity;
      await api.post('/vehicles', { ...vehicleForm, company_id: targetCompanyId });
      toast.success('Vehicle added.');
      setVehicleForm(EMPTY_VEHICLE_FORM);
      loadVehicles();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add vehicle.');
    } finally {
      setSavingVehicle(false);
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
      const targetCompanyId = selectedCity === 'all' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : selectedCity;
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={handleAddVehicle} className="lg:col-span-4 bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-3 h-fit">
            <h3 className="font-semibold text-navy text-sm flex items-center gap-2"><Plus size={15} /> Add Vehicle</h3>
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
                onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })}
                placeholder="e.g. KHI-1234"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
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
            <Button type="submit" variant="accent" disabled={savingVehicle} className="w-full">
              {savingVehicle ? 'Saving...' : 'Add Vehicle'}
            </Button>
          </form>

          <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
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
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v, i) => (
                      <tr key={v.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">{v.name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{v.plate_number}</td>
                        <td className="px-6 py-3.5 text-gray-600 capitalize">{v.type}</td>
                        <td className="px-6 py-3.5">
                          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">Active</span>
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
