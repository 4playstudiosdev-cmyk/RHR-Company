import React, { useEffect, useState } from 'react';
import { Truck, PackageCheck } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const DESTINATIONS = ['Karachi', 'Hyderabad', 'Sukkur'];
const STATUS_BADGE = {
  in_transit: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800'
};
const STATUS_LABEL = { in_transit: 'In Transit', delivered: 'Delivered' };

const EMPTY_FORM = { destination: DESTINATIONS[0], driver: '', notes: '' };

export default function Dispatch() {
  const toast = useToast();
  const [readyOrders, setReadyOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, historyRes] = await Promise.all([
        api.get('/production/orders'),
        api.get('/production/dispatch')
      ]);
      setReadyOrders((ordersRes.data.data || []).filter((o) => o.status === 'ready'));
      setHistory(historyRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dispatch data.');
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!form.driver.trim()) {
      toast.error('Enter a vehicle/driver name.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/production/dispatch', {
        production_order_id: dispatchTarget.id,
        destination: form.destination,
        driver: form.driver.trim(),
        notes: form.notes
      });
      toast.success(`${res.data.data.dispatch_number} dispatched to ${form.destination}.`);
      setDispatchTarget(null);
      setForm(EMPTY_FORM);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch.');
    } finally {
      setSaving(false);
    }
  };

  const markDelivered = async (record) => {
    setBusyId(record.id);
    try {
      await api.patch(`/production/dispatch/${record.id}/deliver`);
      toast.success(`${record.dispatch_number} marked delivered.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="Dispatch Management" subtitle="Send finished goods out to branches" />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <>
          <SkeletonTable rows={3} cols={5} />
          <div className="h-6" />
          <SkeletonTable rows={4} cols={7} />
        </>
      ) : (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-navy">Ready to Dispatch</h2>
            </div>
            {readyOrders.length === 0 ? (
              <EmptyState icon={Truck} title="Nothing ready to dispatch" subtitle="Production orders marked Ready will appear here" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Qty</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Production Order</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Dispatch To</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readyOrders.map((o, i) => (
                      <tr
                        key={o.id}
                        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                          i % 2 === 1 ? 'bg-gray-50/40' : ''
                        }`}
                      >
                        <td className="px-6 py-3.5 font-medium text-navy">{o.product_name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{o.qty} {o.unit}</td>
                        <td className="px-6 py-3.5 text-gray-500">{o.order_number}</td>
                        <td className="px-6 py-3.5 text-gray-400">—</td>
                        <td className="px-6 py-3.5">
                          <button
                            onClick={() => { setDispatchTarget(o); setForm(EMPTY_FORM); }}
                            className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                          >
                            <Truck size={13} /> Dispatch Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-navy">Dispatch History</h2>
            </div>
            {history.length === 0 ? (
              <EmptyState icon={PackageCheck} title="No dispatch records yet" />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Dispatch #</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Qty</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Destination</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Driver</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{r.dispatch_number}</td>
                      <td className="px-6 py-3.5 text-gray-700">{r.product_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{r.qty} {r.unit}</td>
                      <td className="px-6 py-3.5 text-gray-600">{r.destination}</td>
                      <td className="px-6 py-3.5 text-gray-600">{r.driver}</td>
                      <td className="px-6 py-3.5 text-gray-500">{new Date(r.dispatched_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        {r.status === 'in_transit' ? (
                          <button
                            onClick={() => markDelivered(r)}
                            disabled={busyId === r.id}
                            className="text-xs font-medium text-navy hover:underline disabled:opacity-60"
                          >
                            {busyId === r.id ? 'Updating...' : 'Mark Delivered'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}

      {dispatchTarget && (
        <Modal title={`Dispatch — ${dispatchTarget.product_name}`} onClose={() => setDispatchTarget(null)}>
          <form onSubmit={handleDispatch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Destination *</label>
              <select
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                {DESTINATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle / Driver Name *</label>
              <input
                type="text"
                required
                value={form.driver}
                onChange={(e) => setForm({ ...form, driver: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDispatchTarget(null)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Dispatching...' : 'Confirm Dispatch'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
