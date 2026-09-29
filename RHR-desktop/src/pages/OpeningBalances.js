import React, { useEffect, useState } from 'react';
import { Plus, WalletCards, Users, Store, Boxes, Package } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';

const TABS = [
  { key: 'customer', label: 'Customers', icon: Users },
  { key: 'vendor', label: 'Vendors', icon: Store },
  { key: 'raw_material', label: 'Raw Materials', icon: Boxes },
  { key: 'finished_good', label: 'Finished Goods', icon: Package },
];

const EMPTY_FORM = {
  entity_id: '', entity_name: '', balance_type: 'debit', amount: '',
  quantity: '', unit: '', notes: '', balance_date: new Date().toISOString().split('T')[0]
};

export default function OpeningBalances() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('customer');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const companyParams = { company_id: selectedCity };

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedCity]);

  useEffect(() => {
    if (!selectedCity) return;
    api.get('/customers', { params: companyParams }).then((r) => setCustomers(r.data.data || [])).catch(() => setCustomers([]));
    api.get('/production/materials', { params: companyParams }).then((r) => setRawMaterials(r.data.data || [])).catch(() => setRawMaterials([]));
    api.get('/products', { params: { ...companyParams, limit: 500 } }).then((r) => setProducts(r.data.data || [])).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await api.get('/opening-balances', { params: { entity_type: tab } });
      setRecords(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load opening balances.');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const entityOptions = tab === 'customer' ? customers : tab === 'raw_material' ? rawMaterials : tab === 'finished_good' ? products : [];

  const handleEntitySelect = (id) => {
    const item = entityOptions.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      entity_id: id,
      entity_name: item?.fullName || item?.name || '',
      unit: item?.unit || f.unit,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (tab !== 'vendor' && !form.entity_id) {
      toast.error('Select an entity.');
      return;
    }
    if (tab === 'vendor' && !form.entity_name.trim()) {
      toast.error('Enter a vendor name.');
      return;
    }
    if ((tab === 'customer' || tab === 'vendor') && (!form.amount || Number(form.amount) <= 0)) {
      toast.error('Enter a positive amount.');
      return;
    }
    if ((tab === 'raw_material' || tab === 'finished_good') && (form.quantity === '' || Number(form.quantity) < 0)) {
      toast.error('Enter a valid quantity.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/opening-balances', {
        entity_type: tab,
        entity_id: form.entity_id || null,
        entity_name: form.entity_name,
        balance_type: tab === 'customer' || tab === 'vendor' ? form.balance_type : null,
        amount: tab === 'customer' || tab === 'vendor' ? Number(form.amount) : null,
        quantity: tab === 'raw_material' || tab === 'finished_good' ? Number(form.quantity) : null,
        unit: form.unit || null,
        notes: form.notes || null,
        balance_date: form.balance_date,
      });
      toast.success('Opening balance recorded.');
      setShowModal(false);
      loadRecords();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save opening balance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Opening Balances"
        subtitle="One-time starting balances for customers, vendors, raw materials and finished goods"
        action={
          <div className="flex items-center gap-3">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            {selectedCity === 'all' ? (
              <span className="text-xs text-gray-400" title="Select a specific city to add an opening balance">
                Select a city to add
              </span>
            ) : (
              <Button variant="accent" onClick={openAddModal} className="flex items-center gap-2">
                <Plus size={16} /> Add Opening Balance
              </Button>
            )}
          </div>
        }
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

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {records.length === 0 ? (
            <EmptyState icon={WalletCards} title="No opening balances recorded for this category" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    {(tab === 'customer' || tab === 'vendor') && (
                      <>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                      </>
                    )}
                    {(tab === 'raw_material' || tab === 'finished_good') && (
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Quantity</th>
                    )}
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{r.entity_name}</td>
                      {(tab === 'customer' || tab === 'vendor') && (
                        <>
                          <td className="px-6 py-3.5">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                              r.balance_type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {r.balance_type === 'debit' ? 'Owes Us' : 'We Owe'}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right text-gray-700">PKR {Number(r.amount).toLocaleString()}</td>
                        </>
                      )}
                      {(tab === 'raw_material' || tab === 'finished_good') && (
                        <td className="px-6 py-3.5 text-right text-gray-700">{Number(r.quantity).toLocaleString()} {r.unit}</td>
                      )}
                      <td className="px-6 py-3.5 text-gray-600">{new Date(r.balance_date).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5 text-gray-500">{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={`Add Opening Balance — ${TABS.find((t) => t.key === tab).label}`} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            {tab === 'vendor' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vendor Name *</label>
                <input
                  type="text"
                  required
                  value={form.entity_name}
                  onChange={(e) => setForm({ ...form, entity_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {tab === 'customer' ? 'Customer' : tab === 'raw_material' ? 'Raw Material' : 'Product'} *
                </label>
                <select
                  required
                  value={form.entity_id}
                  onChange={(e) => handleEntitySelect(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  <option value="">— Select —</option>
                  {entityOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.fullName || e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(tab === 'customer' || tab === 'vendor') && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Balance Type</label>
                    <select
                      value={form.balance_type}
                      onChange={(e) => setForm({ ...form, balance_type: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                    >
                      <option value="debit">Owes Us (Debit)</option>
                      <option value="credit">We Owe Them (Credit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (PKR) *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                  </div>
                </div>
                {tab === 'vendor' && (
                  <p className="text-xs text-gray-400 -mt-2">
                    Vendors aren't tracked in a separate table yet — this just records the starting balance for reference.
                  </p>
                )}
              </>
            )}

            {(tab === 'raw_material' || tab === 'finished_good') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Unit</label>
                  <input
                    type="text"
                    readOnly
                    value={form.unit}
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-500"
                  />
                </div>
                <p className="text-xs text-gray-400 col-span-2 -mt-1">
                  This directly sets the item's current stock — use it once, before any real transactions.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Balance Date</label>
              <input
                type="date"
                value={form.balance_date}
                onChange={(e) => setForm({ ...form, balance_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
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
    </div>
  );
}
