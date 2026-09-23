import React, { useEffect, useState } from 'react';
import { RotateCcw, Package, Boxes, ShoppingCart, FileDown } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';
import { buildInvoicePdf } from '../utils/invoicePdf';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const TABS = [
  { key: 'packaging', label: 'Packaging Return', icon: Package },
  { key: 'raw_material', label: 'Raw Material Return', icon: Boxes },
  { key: 'order', label: 'Order Return', icon: ShoppingCart },
];
const EMPTY_MATERIAL_FORM = { raw_material_id: '', quantity: '', notes: '' };
const EMPTY_ORDER_FORM = { order_id: '', amount_returned: '', notes: '' };

export default function Returns() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('packaging');

  const [materials, setMaterials] = useState([]);
  const [materialReturns, setMaterialReturns] = useState([]);
  const [materialForm, setMaterialForm] = useState(EMPTY_MATERIAL_FORM);
  const [savingMaterial, setSavingMaterial] = useState(false);

  const [orders, setOrders] = useState([]);
  const [orderReturns, setOrderReturns] = useState([]);
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER_FORM);
  const [savingOrderReturn, setSavingOrderReturn] = useState(false);
  const [lastReturn, setLastReturn] = useState(null); // confirmation sub-panel after a successful order return

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLastReturn(null);
    loadTabData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, tab]);

  const loadTabData = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      if (tab === 'order') {
        const [ordersData, returnsData] = companyFilter
          ? await Promise.all([
              api.get('/orders', { params: { company_id: companyFilter } }).then((r) => r.data.data || []),
              api.get('/returns/orders', { params: { company_id: companyFilter } }).then((r) => r.data.data || [])
            ])
          : await Promise.all([fetchAllCities('/orders'), fetchAllCities('/returns/orders')]);
        setOrders(ordersData);
        setOrderReturns(returnsData);
      } else {
        const [materialsData, returnsData] = companyFilter
          ? await Promise.all([
              api.get('/production/materials', { params: { company_id: companyFilter } }).then((r) => r.data.data || []),
              api.get('/returns/materials', { params: { company_id: companyFilter, type: tab } }).then((r) => r.data.data || [])
            ])
          : await Promise.all([
              fetchAllCities('/production/materials'),
              fetchAllCities('/returns/materials', { type: tab })
            ]);
        setMaterials(materialsData);
        setMaterialReturns(returnsData);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load returns.');
    } finally {
      setLoading(false);
    }
  };

  const materialOptions = tab === 'packaging'
    ? materials.filter((m) => m.category === 'packaging')
    : materials;

  const handleSaveMaterialReturn = async (e) => {
    e.preventDefault();
    if (!materialForm.raw_material_id || !materialForm.quantity || Number(materialForm.quantity) <= 0) {
      toast.error('Select a material and enter a valid quantity.');
      return;
    }
    setSavingMaterial(true);
    try {
      await api.post('/returns/materials', {
        return_type: tab,
        raw_material_id: materialForm.raw_material_id,
        quantity: Number(materialForm.quantity),
        notes: materialForm.notes || null
      });
      toast.success('Return recorded — stock updated.');
      setMaterialForm(EMPTY_MATERIAL_FORM);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record return.');
    } finally {
      setSavingMaterial(false);
    }
  };

  const selectedOrder = orders.find((o) => o.id === orderForm.order_id);
  const updatedTotal = selectedOrder
    ? Number(selectedOrder.total_amount) - (Number(orderForm.amount_returned) || 0)
    : 0;

  const handleSaveOrderReturn = async (e) => {
    e.preventDefault();
    if (!orderForm.order_id) { toast.error('Select an order.'); return; }
    const amount = Number(orderForm.amount_returned);
    if (!amount || amount <= 0) { toast.error('Enter a valid return amount.'); return; }
    if (selectedOrder && amount > Number(selectedOrder.total_amount)) {
      toast.error('Return amount cannot exceed the order total.');
      return;
    }
    setSavingOrderReturn(true);
    try {
      const res = await api.post('/returns/orders', {
        order_id: orderForm.order_id,
        amount_returned: amount,
        notes: orderForm.notes || null
      });
      toast.success(`Return recorded — ${selectedOrder?.users?.full_name || 'customer'}'s ledger updated.`);
      setLastReturn({
        order: selectedOrder,
        amountTotal: Number(selectedOrder.total_amount),
        amountReturned: amount,
        updatedTotal: Number(selectedOrder.total_amount) - amount
      });
      setOrderForm(EMPTY_ORDER_FORM);
      loadTabData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record return.');
    } finally {
      setSavingOrderReturn(false);
    }
  };

  const handleGenerateUpdatedInvoice = async () => {
    if (!lastReturn) return;
    try {
      const res = await api.get(`/orders/${lastReturn.order.id}`);
      buildInvoicePdf(res.data.data);
      toast.success('Updated invoice downloaded.');
    } catch (err) {
      toast.error('Failed to generate updated invoice.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Returns</h1>
          <p className="text-sm text-gray-500 mt-1">Packaging, raw material, and order returns.</p>
        </div>
        <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
      </div>

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

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {tab !== 'order' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-fit">
            <h3 className="font-semibold text-navy text-sm mb-4 flex items-center gap-2">
              <RotateCcw size={15} /> Record {tab === 'packaging' ? 'Packaging' : 'Raw Material'} Return
            </h3>
            <form onSubmit={handleSaveMaterialReturn} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
                <select
                  value={materialForm.raw_material_id}
                  onChange={(e) => setMaterialForm({ ...materialForm, raw_material_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  <option value="">— Select —</option>
                  {materialOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
                {tab === 'packaging' && materialOptions.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No materials in the Packaging category yet.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quantity Returned</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={materialForm.quantity}
                  onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={materialForm.notes}
                  onChange={(e) => setMaterialForm({ ...materialForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <Button type="submit" variant="accent" disabled={savingMaterial} className="w-full">
                {savingMaterial ? 'Saving...' : 'Record Return'}
              </Button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loading ? (
              <SkeletonTable rows={6} cols={3} />
            ) : materialReturns.length === 0 ? (
              <EmptyState icon={RotateCcw} title="No returns recorded yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Qty</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialReturns.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="px-6 py-3.5 font-medium text-navy">{r.raw_materials?.name || '—'}</td>
                        <td className="px-6 py-3.5 text-right text-gray-700">{r.quantity} {r.raw_materials?.unit || ''}</td>
                        <td className="px-6 py-3.5 text-gray-500">{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-fit">
            <h3 className="font-semibold text-navy text-sm mb-4 flex items-center gap-2">
              <RotateCcw size={15} /> Record Order Return
            </h3>
            <form onSubmit={handleSaveOrderReturn} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Order</label>
                <select
                  value={orderForm.order_id}
                  onChange={(e) => setOrderForm({ ...orderForm, order_id: e.target.value, amount_returned: '' })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  <option value="">— Select Order —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.order_number} — {o.users?.full_name || 'Customer'}</option>
                  ))}
                </select>
              </div>

              {selectedOrder && (
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-3 space-y-1 text-sm">
                  <p className="text-gray-600">Customer: <span className="font-semibold text-navy">{selectedOrder.users?.full_name || '—'}</span></p>
                  <p className="text-gray-600">Amount Total: <span className="font-semibold text-navy">PKR {Number(selectedOrder.total_amount).toLocaleString()}</span></p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount to Return (PKR)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  disabled={!orderForm.order_id}
                  value={orderForm.amount_returned}
                  onChange={(e) => setOrderForm({ ...orderForm, amount_returned: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow disabled:bg-gray-50"
                />
              </div>

              {selectedOrder && orderForm.amount_returned && (
                <div className="bg-navy-chip/30 border border-navy-chip rounded-xl px-3.5 py-3 text-sm">
                  <p className="text-gray-600">Updated Total (after return): <span className="font-semibold text-navy">PKR {updatedTotal.toLocaleString()}</span></p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={orderForm.notes}
                  onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>

              <Button type="submit" variant="accent" disabled={savingOrderReturn || !orderForm.order_id} className="w-full">
                {savingOrderReturn ? 'Saving...' : 'Record Return'}
              </Button>
            </form>

            {lastReturn && (
              <div className="mt-5 border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-800">Return recorded</p>
                <div className="text-sm text-emerald-900 space-y-0.5">
                  <p>Order #: <strong>{lastReturn.order.order_number}</strong></p>
                  <p>Customer: <strong>{lastReturn.order.users?.full_name || '—'}</strong></p>
                  <p>Amount Total: PKR {lastReturn.amountTotal.toLocaleString()}</p>
                  <p>Returned: PKR {lastReturn.amountReturned.toLocaleString()}</p>
                  <p>Updated Total: <strong>PKR {lastReturn.updatedTotal.toLocaleString()}</strong></p>
                </div>
                <Button type="button" variant="primary" onClick={handleGenerateUpdatedInvoice} className="w-full flex items-center justify-center gap-2 mt-2">
                  <FileDown size={15} /> Generate Updated Invoice
                </Button>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : orderReturns.length === 0 ? (
              <EmptyState icon={RotateCcw} title="No order returns recorded yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount Total</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderReturns.map((r, i) => (
                      <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="px-6 py-3.5 font-medium text-navy">{r.orders?.order_number || '—'}</td>
                        <td className="px-6 py-3.5 text-gray-600">{r.users?.full_name || '—'}</td>
                        <td className="px-6 py-3.5 text-right text-gray-700">PKR {Number(r.amount_total).toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-right font-semibold text-red-600">PKR {Number(r.amount_returned).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
