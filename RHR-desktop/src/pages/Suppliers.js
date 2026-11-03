import React, { useEffect, useState } from 'react';
import { Plus, Store, UserX, Pencil, Search, BookOpen, X, ChevronDown } from 'lucide-react';
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
const EMPTY_FORM = { name: '', address: '', contact_number: '', categories: [], opening_balance_amount: '' };

const fmtPKR = (n) => 'PKR ' + Number(n).toLocaleString();

export default function Suppliers() {
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
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Ledger modal state
  const [ledgerSupplier, setLedgerSupplier] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ entry_type: 'debit', amount: '', description: '' });
  const [adjusting, setAdjusting] = useState(false);

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

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      address: s.address || '',
      contact_number: s.contact_number || '',
      categories: s.categories || [],
      opening_balance_amount: '',
    });
    setShowModal(true);
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
        if (newSupplier?.id && form.opening_balance_amount && Number(form.opening_balance_amount) > 0) {
          try {
            await api.post('/opening-balances', {
              entity_type: 'vendor',
              entity_id: newSupplier.id,
              entity_name: form.name.trim(),
              balance_type: 'debit',
              amount: Number(form.opening_balance_amount),
              notes: 'Opening balance at supplier creation',
            });
          } catch (obErr) {
            toast.error('Supplier added but opening balance failed — run phase77 SQL first.');
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

  const openLedger = async (supplier) => {
    setLedgerSupplier(supplier);
    setLedgerEntries([]);
    setLedgerBalance(0);
    setAdjustForm({ entry_type: 'debit', amount: '', description: '' });
    setLedgerLoading(true);
    try {
      const r = await api.get(`/suppliers/${supplier.id}/ledger`);
      setLedgerEntries(r.data?.data?.entries || []);
      setLedgerBalance(r.data?.data?.currentBalance ?? 0);
    } catch (err) {
      toast.error('Failed to load ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const closeLedger = () => setLedgerSupplier(null);

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustForm.amount || Number(adjustForm.amount) <= 0) { toast.error('Enter a positive amount.'); return; }
    if (!adjustForm.description.trim()) { toast.error('Enter a description.'); return; }
    setAdjusting(true);
    try {
      await api.post(`/suppliers/${ledgerSupplier.id}/ledger/adjustment`, {
        entry_type: adjustForm.entry_type,
        amount: Number(adjustForm.amount),
        description: adjustForm.description.trim(),
      });
      toast.success('Entry added.');
      setAdjustForm({ entry_type: 'debit', amount: '', description: '' });
      // Reload ledger
      const r = await api.get(`/suppliers/${ledgerSupplier.id}/ledger`);
      setLedgerEntries(r.data?.data?.entries || []);
      setLedgerBalance(r.data?.data?.currentBalance ?? 0);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add entry.');
    } finally {
      setAdjusting(false);
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
                        <button
                          onClick={() => openLedger(s)}
                          className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                          title="View ledger"
                        >
                          <BookOpen size={13} /> Ledger
                        </button>
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
            {!editing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Balance — Amount Owed (optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">PKR</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.opening_balance_amount}
                    onChange={(e) => setForm({ ...form, opening_balance_amount: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg pl-12 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Enter the amount you owe this supplier from before today. Leave blank if starting fresh.</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Supplier Ledger Modal */}
      {ledgerSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-navy">{ledgerSupplier.name} — Ledger</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Current Balance:&nbsp;
                  <span className={`font-semibold ${ledgerBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtPKR(ledgerBalance)}
                  </span>
                  {ledgerBalance > 0 && <span className="text-gray-400 ml-1">(you owe)</span>}
                  {ledgerBalance < 0 && <span className="text-gray-400 ml-1">(they owe you)</span>}
                </p>
              </div>
              <button onClick={closeLedger} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Add Entry Form */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Add Entry</p>
              <form onSubmit={handleAdjust} className="flex flex-wrap gap-2 items-end">
                <div className="flex-shrink-0">
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select
                    value={adjustForm.entry_type}
                    onChange={(e) => setAdjustForm({ ...adjustForm, entry_type: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white"
                  >
                    <option value="debit">Debit (we owe more)</option>
                    <option value="credit">Credit (payment / discount)</option>
                  </select>
                </div>
                <div className="flex-shrink-0">
                  <label className="block text-xs text-gray-500 mb-1">Amount (PKR)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={adjustForm.amount}
                    onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                    placeholder="0"
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                  />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={adjustForm.description}
                    onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })}
                    placeholder="e.g. Invoice #1234 payment"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                  />
                </div>
                <Button type="submit" variant="accent" disabled={adjusting} className="flex-shrink-0">
                  {adjusting ? 'Adding...' : 'Add'}
                </Button>
              </form>
            </div>

            {/* Ledger Entries */}
            <div className="overflow-y-auto flex-1">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">Loading…</div>
              ) : ledgerEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <BookOpen size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">No ledger entries yet.</p>
                  <p className="text-xs mt-1">Add an opening balance above or record a payment.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                    <tr className="text-left text-gray-500 bg-gray-50">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Debit</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Credit</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((e, i) => (
                      <tr key={e.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(e.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-3 text-gray-700">
                          {e.description}
                          {e.reference_type === 'opening_balance' && (
                            <span className="ml-1.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">Opening</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-red-600 font-medium">
                          {e.entry_type === 'debit' ? fmtPKR(e.amount) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right text-green-600 font-medium">
                          {e.entry_type === 'credit' ? fmtPKR(e.amount) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right font-semibold text-navy">
                          {fmtPKR(e.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
