import React, { useEffect, useState } from 'react';
import { Plus, Store, UserX, Pencil, Search, BookOpen } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

const CATEGORIES = [
  { label: 'Cement', value: 'binder' },
  { label: 'Sand/Bajri', value: 'filler' },
  { label: 'Chemicals', value: 'chemical' },
  { label: 'Pigments', value: 'pigment' },
  { label: 'Packaging', value: 'packaging' },
  { label: 'Other', value: 'other' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const OB_TYPES = [
  { value: 'debit',  label: 'We Owe Supplier',   hint: 'Opening balance payable', activeClass: 'border-red-300 bg-red-50 text-red-700 ring-1 ring-red-200' },
  { value: 'credit', label: 'Supplier Owes Us',  hint: 'Advance already paid',    activeClass: 'border-green-300 bg-green-50 text-green-700 ring-1 ring-green-200' },
];
const emptyForm = () => ({
  name: '', address: '', contact_number: '', categories: [],
  ob_type: 'debit', ob_amount: '', ob_date: todayStr(), had_ob: false,
});

export default function Suppliers({ onViewVendorLedger }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryTab, setCategoryTab] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);


  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const data = companyFilter
        ? (await api.get('/suppliers', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/suppliers');
      setSuppliers(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      ...emptyForm(),
      name: s.name || '',
      address: s.address || '',
      contact_number: s.contact_number || '',
      categories: s.categories || [],
    });
    api.get('/opening-balances', { params: { entity_type: 'vendor', entity_id: s.id } })
      .then((r) => {
        // newest first; a vendor has one opening balance (older data may hold two — take the newest non-zero)
        const entry = (r.data?.data || []).find(e => Number(e.amount) > 0);
        if (!entry) return;
        setForm((prev) => ({
          ...prev,
          ob_type: entry.balance_type === 'credit' ? 'credit' : 'debit',
          ob_amount: String(entry.amount),
          ob_date: (entry.balance_date || '').slice(0, 10) || prev.ob_date,
          had_ob: true,
        }));
      })
      .catch(() => {});
    setShowModal(true);
  };

  const saveOpeningBalance = async (supplierId) => {
    await api.patch(`/opening-balances/vendor/${supplierId}`, {
      amount: Number(form.ob_amount || 0),
      balance_type: form.ob_type,
      balance_date: form.ob_date || todayStr(),
      entity_name: form.name.trim(),
    });
  };

  const toggleCategory = (value) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(value)
        ? prev.categories.filter((c) => c !== value)
        : [...prev.categories, value]
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Enter a supplier name.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/suppliers/${editing.id}`, {
          name: form.name,
          address: form.address,
          contact_number: form.contact_number,
          categories: form.categories,
        });
        // Save when an amount is entered, or when an existing one was blanked (clears it)
        if (form.ob_amount !== '' || form.had_ob) {
          try {
            await saveOpeningBalance(editing.id);
          } catch (balErr) {
            toast.error('Supplier saved but opening balance update failed: ' + (balErr.response?.data?.message || balErr.message));
          }
        }
        toast.success('Supplier updated.');
      } else {
        const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
        const res = await api.post('/suppliers', {
          name: form.name,
          address: form.address,
          contact_number: form.contact_number,
          categories: form.categories,
          company_id: targetCompanyId,
        });
        const newSupplier = res.data?.data;
        if (newSupplier?.id && Number(form.ob_amount) > 0) {
          try {
            await saveOpeningBalance(newSupplier.id);
          } catch (obErr) {
            toast.error('Supplier added but opening balance failed: ' + (obErr.response?.data?.message || obErr.message));
          }
        }
        toast.success('Supplier added.');
      }
      setShowModal(false);
      loadSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (supplier) => {
    if (!window.confirm(`Remove "${supplier.name}" from the suppliers list?`)) return;
    setBusyId(supplier.id);
    try {
      await api.delete(`/suppliers/${supplier.id}`);
      toast.success('Supplier removed.');
      loadSuppliers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove supplier.');
    } finally {
      setBusyId(null);
    }
  };


  const filtered = suppliers
    .filter((s) => categoryTab === 'All' || (s.categories || []).includes(categoryTab))
    .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-1">Suppliers available in the Raw Materials purchase flow.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <Button variant="accent" onClick={openAdd} className="flex items-center gap-2">
            <Plus size={16} /> Add Supplier
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {[{ label: 'All', value: 'All' }, ...CATEGORIES].map((c) => (
          <button
            key={c.value}
            onClick={() => setCategoryTab(c.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              categoryTab === c.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Store} title="No suppliers found" subtitle={search || categoryTab !== 'All' ? 'Try a different search or category' : "Add one here, or it'll be added automatically the first time you type a new name on a purchase"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Address</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Contact Number</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Supplies</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5 font-medium text-navy">{s.name}</td>
                    <td className="px-6 py-3.5 text-gray-600 max-w-[220px] truncate">{s.address || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{s.contact_number || '—'}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(s.categories || []).length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          s.categories.map((c) => (
                            <span key={c} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-navy-chip text-navy">
                              {CATEGORY_LABEL[c] || c}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        {onViewVendorLedger && (
                          <button
                            onClick={() => onViewVendorLedger(s.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                            title="View ledger"
                          >
                            <BookOpen size={13} /> Ledger
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(s)}
                          className="p-2 rounded-lg text-navy hover:bg-navy/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleRemove(s)}
                          disabled={busyId === s.id}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Remove"
                        >
                          <UserX size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Supplier Name *</label>
              <input
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lucky Cement OPC"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Number</label>
              <input
                type="text"
                value={form.contact_number}
                onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
                placeholder="03001234567"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">What They Supply</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <label key={c.value} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={form.categories.includes(c.value)}
                      onChange={() => toggleCategory(c.value)}
                    />
                    <span className="text-sm text-gray-700">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50/50">
              <label className="block text-sm font-medium text-gray-700">Opening Balance</label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Opening balance type">
                {OB_TYPES.map((t) => {
                  const active = form.ob_type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setForm({ ...form, ob_type: t.value })}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${active ? t.activeClass : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block text-[11px] opacity-80">{t.hint}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (PKR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">PKR</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.ob_amount}
                      onChange={(e) => setForm({ ...form, ob_amount: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg pl-12 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">As of Date</label>
                  <input
                    type="date"
                    value={form.ob_date}
                    max={todayStr()}
                    onChange={(e) => setForm({ ...form, ob_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                {form.ob_type === 'credit'
                  ? 'Advance already paid to this supplier — shows as a credit on the first line of their ledger.'
                  : 'Amount you owe this supplier as of this date — shows as a debit on the first line of their ledger.'}
                {editing && form.had_ob ? ' Set the amount to 0 to remove it.' : ' Leave blank if starting fresh.'}
              </p>
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
