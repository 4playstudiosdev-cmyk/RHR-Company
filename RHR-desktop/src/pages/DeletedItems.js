import React, { useEffect, useState } from 'react';
import { Trash2, ShoppingCart, Boxes, Wallet } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import CityFilter from '../components/CityFilter';

// Same code -> pretty-label mapping as production/RawMaterials.jsx —
// raw_materials.category stores lowercase codes, not the names shown there.
const CATEGORY_LABEL = { binder: 'Cement', filler: 'Sand/Bajri', chemical: 'Chemicals', pigment: 'Pigments', packaging: 'Packaging', other: 'Other' };

const TABS = [
  { key: 'orders', label: 'Orders & Invoices', icon: ShoppingCart },
  { key: 'materials', label: 'Raw Materials', icon: Boxes },
  { key: 'payments', label: 'Payments', icon: Wallet },
];

// Super-admin-only audit hub for everything soft-deleted across the app —
// deleted order invoices (and orders deleted before an invoice ever
// existed, see Orders.js), deactivated raw materials, and (once that
// feature exists) deleted payments.
export default function DeletedItems() {
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTabData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedCity]);

  const loadTabData = async () => {
    if (tab === 'payments') return;
    setLoading(true);
    setError('');
    try {
      if (tab === 'orders') {
        const res = await api.get('/orders/deleted-invoices');
        setOrders(res.data.data || []);
      } else if (tab === 'materials') {
        const companyFilter = selectedCity === 'all' ? null : selectedCity;
        const res = await api.get('/production/materials/deleted', {
          params: companyFilter ? { company_id: companyFilter } : {}
        });
        setMaterials(res.data.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load deleted items.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Deleted Items"
        subtitle="Audit record of everything deleted across the app"
        action={tab === 'materials' ? <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} /> : null}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {tab === 'payments' ? (
          <EmptyState icon={Wallet} title="Deleted payments aren't tracked yet" subtitle="Ask for this to be added once it's confirmed how a deleted payment should affect the customer's ledger balance" />
        ) : loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : tab === 'orders' ? (
          orders.length === 0 ? (
            <EmptyState icon={Trash2} title="No deleted orders or invoices" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Deleted At</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Deleted By</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((inv, i) => (
                    <tr key={inv.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{inv.order_number || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600">{inv.customer_name || '—'}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-red-600">
                        PKR {Number(inv.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(inv.deleted_at).toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-gray-600">{inv.deleted_by_user?.full_name || '—'}</td>
                      <td className={`px-6 py-3.5 text-gray-500 ${!inv.reason ? 'italic' : ''}`}>{inv.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : materials.length === 0 ? (
          <EmptyState icon={Trash2} title="No deleted raw materials" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Stock at Deletion</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={m.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5 font-medium text-navy">{m.name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{CATEGORY_LABEL[m.category] || m.category}</td>
                    <td className="px-6 py-3.5 text-gray-600">{m.unit}</td>
                    <td className="px-6 py-3.5 text-right text-gray-700">{Number(m.stock).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
