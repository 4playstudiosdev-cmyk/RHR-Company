import React, { useEffect, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';

// A plain cash-custody log — "driver X received/handed over PKR Y
// to/from salesman Z" — deliberately NOT tied to the ledger (see
// sql/phase58_driver_recovery.sql): the actual customer payment was
// already credited wherever it was collected (Salesman Recovery, or a
// driver's own COD collection on delivery). This page just lets admin
// look up who's holding what cash between the two of them.
const EMPTY_FORM = { driver_id: '', salesman_id: '', amount: '', notes: '' };

export default function DriverRecovery() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);

  const [driversList, setDriversList] = useState([]);
  const [salesmenList, setSalesmenList] = useState([]);
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  useEffect(() => {
    loadDrivers();
    loadSalesmen();
    loadHandoffs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadDrivers = async () => {
    try {
      const res = await api.get('/drivers', { params: companyFilter ? { company_id: companyFilter } : {} });
      setDriversList(res.data.data || []);
    } catch (err) { /* best-effort */ }
  };

  const loadSalesmen = async () => {
    try {
      const res = await api.get('/salesmen', { params: companyFilter ? { company_id: companyFilter } : {} });
      setSalesmenList(res.data.data || []);
    } catch (err) { /* best-effort */ }
  };

  const loadHandoffs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/recovery/driver-handoffs', { params: companyFilter ? { company_id: companyFilter } : {} });
      setHandoffs(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load driver recovery records.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.driver_id || !form.amount || Number(form.amount) <= 0) {
      toast.error('Driver and a positive amount are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/recovery/driver-handoffs', {
        driver_id: form.driver_id,
        salesman_id: form.salesman_id || null,
        amount: Number(form.amount),
        notes: form.notes,
      });
      toast.success('Handoff recorded.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadHandoffs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record handoff.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="Driver Recovery" subtitle="Cash handed between a driver and a salesman — a lookup log, not a ledger entry" />

      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <CityFilter value={selectedCity} onChange={setSelectedCity} showAll={user?.role === 'super_admin'} />
        <Button variant="accent" onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2">
          <Plus size={15} /> Record Handoff
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Driver *</label>
              <select
                value={form.driver_id}
                onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">Select driver...</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name} {d.car_number ? `(${d.car_number})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Salesman (optional)</label>
              <select
                value={form.salesman_id}
                onChange={(e) => setForm({ ...form, salesman_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— None —</option>
                {salesmenList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (PKR) *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : handoffs.length === 0 ? (
        <EmptyState icon={Truck} title="No handoffs recorded" subtitle="Driver-salesman cash handoffs will appear here" />
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Driver</th>
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody>
              {handoffs.map((h, i) => (
                <tr key={h.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-4 py-3 text-gray-500">{new Date(h.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3 font-medium text-navy">{h.drivers?.full_name || '—'}{h.drivers?.car_number ? ` (${h.drivers.car_number})` : ''}</td>
                  <td className="px-4 py-3 text-gray-600">{h.salesmen?.full_name || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-orange">PKR {Number(h.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{h.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
