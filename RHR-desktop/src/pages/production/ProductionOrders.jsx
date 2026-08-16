import React, { useEffect, useState } from 'react';
import { Plus, ClipboardList, Check, Circle } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const STATUS_FLOW = ['pending', 'in_production', 'ready', 'dispatched'];
const STATUS_LABEL = { pending: 'Pending', in_production: 'In Production', ready: 'Ready', dispatched: 'Dispatched' };
const STATUS_TABS = ['All', ...STATUS_FLOW];

const STATUS_BADGE = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_production: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  dispatched: 'bg-gray-200 text-gray-600'
};

const NEXT_ACTION = {
  pending: { label: 'Start Production', next: 'in_production', className: 'bg-blue-600 hover:bg-blue-700' },
  in_production: { label: 'Mark Ready', next: 'ready', className: 'bg-green-600 hover:bg-green-700' }
};

const EMPTY_FORM = { product_id: '', qty: '', batches: '1', priority: 'normal', notes: '', start_date: new Date().toISOString().split('T')[0] };

export default function ProductionOrders() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);

  useEffect(() => {
    loadOrders();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/production/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load production orders.');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await api.get('/products', { params: { limit: 200 } });
      const data = res.data.data;
      const list = data?.products || (Array.isArray(data) ? data : []);
      setProducts(list);
      if (list.length > 0) setForm((prev) => ({ ...prev, product_id: list[0].id }));
    } catch (err) {
      toast.error('Failed to load products list.');
    }
  };

  const filtered = tab === 'All' ? orders : orders.filter((o) => o.status === tab);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.product_id) { toast.error('Select a product.'); return; }
    if (!form.qty || Number(form.qty) <= 0) { toast.error('Enter a valid quantity.'); return; }
    setSaving(true);
    try {
      await api.post('/production/orders', {
        product_id: form.product_id,
        qty: Number(form.qty),
        batches: Number(form.batches) || 1,
        priority: form.priority,
        notes: form.notes,
        start_date: form.start_date
      });
      toast.success('Production order created.');
      setShowModal(false);
      setForm((prev) => ({ ...EMPTY_FORM, product_id: prev.product_id }));
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create production order.');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (order) => {
    const action = NEXT_ACTION[order.status];
    if (!action) return;
    setBusyId(order.id);
    try {
      await api.patch(`/production/orders/${order.id}/status`, { status: action.next });
      toast.success(`${order.order_number} marked ${STATUS_LABEL[action.next]}.`);
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Production Orders"
        subtitle="Plan and track manufacturing batches"
        action={
          <Button variant="accent" onClick={() => setShowModal(true)} className="flex items-center gap-2">
            <Plus size={16} /> New Production Order
          </Button>
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t === 'All' ? 'All' : STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No production orders" subtitle="Create one to get started" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Qty</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Batches</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Started</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, i) => {
                  const action = NEXT_ACTION[o.status];
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors cursor-pointer ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                      onClick={() => setDetailOrder(o)}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{o.order_number}</td>
                      <td className="px-6 py-3.5 text-gray-700">{o.product_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{o.qty} {o.unit}</td>
                      <td className="px-6 py-3.5 text-gray-600">{o.batches} batches</td>
                      <td className="px-6 py-3.5 text-gray-500">{o.start_date}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[o.status]}`}>
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="px-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {action ? (
                          <button
                            onClick={() => advanceStatus(o)}
                            disabled={busyId === o.id}
                            className={`text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${action.className}`}
                          >
                            {busyId === o.id ? 'Updating...' : action.label}
                          </button>
                        ) : o.status === 'ready' ? (
                          <span className="text-xs text-gray-400">Dispatch from Dispatch page</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal title="New Production Order" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Product *</label>
              <select
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                {products.length === 0 && <option value="">No products found</option>}
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity Needed *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Batches</label>
                <input
                  type="number"
                  min="1"
                  value={form.batches}
                  onChange={(e) => setForm({ ...form, batches: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <div className="flex gap-4">
                {[{ v: 'normal', l: 'Normal' }, { v: 'urgent', l: 'Urgent' }].map((p) => (
                  <label key={p.v} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={form.priority === p.v}
                      onChange={() => setForm({ ...form, priority: p.v })}
                    />
                    {p.l}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
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
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {detailOrder && (
        <Modal title={`${detailOrder.order_number} — ${detailOrder.product_name}`} onClose={() => setDetailOrder(null)}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-400 text-xs">Quantity</p><p className="font-medium text-navy">{detailOrder.qty} {detailOrder.unit}</p></div>
              <div><p className="text-gray-400 text-xs">Batches</p><p className="font-medium text-navy">{detailOrder.batches}</p></div>
              <div><p className="text-gray-400 text-xs">Started</p><p className="font-medium text-navy">{detailOrder.start_date}</p></div>
              <div><p className="text-gray-400 text-xs">Priority</p><p className="font-medium text-navy capitalize">{detailOrder.priority}</p></div>
            </div>

            {detailOrder.notes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                <p className="font-semibold text-gray-600 mb-1">Notes</p>
                {detailOrder.notes}
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500">
              <p className="font-semibold text-gray-600 mb-1">Raw Materials Required</p>
              Configure recipe to see raw material requirements.
            </div>

            <div>
              <p className="font-semibold text-navy text-sm mb-3">Progress Timeline</p>
              <div className="flex flex-col gap-0">
                {STATUS_FLOW.map((step, idx) => {
                  const currentIdx = STATUS_FLOW.indexOf(detailOrder.status);
                  const done = idx <= currentIdx;
                  const isLast = idx === STATUS_FLOW.length - 1;
                  return (
                    <div key={step} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${done ? 'bg-orange text-white' : 'bg-gray-200 text-gray-400'}`}>
                          {done ? <Check size={13} /> : <Circle size={8} className="fill-current" />}
                        </div>
                        {!isLast && <div className={`w-0.5 h-8 ${idx < currentIdx ? 'bg-orange' : 'bg-gray-200'}`} />}
                      </div>
                      <p className={`text-sm pt-0.5 ${done ? 'text-navy font-medium' : 'text-gray-400'}`}>{STATUS_LABEL[step]}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
