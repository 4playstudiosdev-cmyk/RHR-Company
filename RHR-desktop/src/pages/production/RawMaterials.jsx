import React, { useEffect, useState } from 'react';
import { Plus, AlertCircle, PackagePlus } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';

const MATERIAL_CATEGORIES = ['Cement', 'Sand/Bajri', 'Chemicals', 'Pigments', 'Other'];
const UNITS = ['kg', 'litre', 'piece', 'bag'];
const EMPTY_FORM = { name: '', category: MATERIAL_CATEGORIES[0], unit: UNITS[0], stock: '', min_level: '' };
const EMPTY_STOCK_FORM = { quantity: '', date: new Date().toISOString().split('T')[0], note: '' };

export default function RawMaterials() {
  const toast = useToast();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm, setStockForm] = useState(EMPTY_STOCK_FORM);
  const [savingStock, setSavingStock] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/production/materials');
      setMaterials(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load raw materials.');
    } finally {
      setLoading(false);
    }
  };

  const tabs = ['All', ...MATERIAL_CATEGORIES];
  const filtered = tab === 'All' ? materials : materials.filter((m) => m.category === tab);

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!form.name || form.stock === '' || form.min_level === '') {
      toast.error('Material name, current stock and minimum level are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/production/materials', {
        name: form.name,
        category: form.category,
        unit: form.unit,
        stock: Number(form.stock),
        min_level: Number(form.min_level)
      });
      toast.success('Material added.');
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      loadMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add material.');
    } finally {
      setSaving(false);
    }
  };

  const openAddStock = (material) => {
    setStockTarget(material);
    setStockForm(EMPTY_STOCK_FORM);
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    if (!stockForm.quantity || Number(stockForm.quantity) <= 0) {
      toast.error('Enter a valid quantity.');
      return;
    }
    setSavingStock(true);
    try {
      await api.patch(`/production/materials/${stockTarget.id}/stock`, {
        quantity: Number(stockForm.quantity),
        date: stockForm.date,
        note: stockForm.note
      });
      toast.success(`Added ${stockForm.quantity} ${stockTarget.unit} to ${stockTarget.name}.`);
      setStockTarget(null);
      loadMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add stock.');
    } finally {
      setSavingStock(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Raw Materials Stock"
        subtitle="Track raw material inventory used in production"
        action={
          <Button variant="accent" onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
            <Plus size={16} /> Add Material
          </Button>
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t}
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
            <EmptyState icon={PackagePlus} title="No materials in this category" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">In Stock</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Min Level</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const low = Number(m.stock) < Number(m.min_level);
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{m.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{m.category}</td>
                      <td className="px-6 py-3.5 text-gray-600">{m.unit}</td>
                      <td className="px-6 py-3.5 text-right text-gray-700">{Number(m.stock).toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-right text-gray-500">{Number(m.min_level).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
                        {low ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <AlertCircle size={12} /> Low Stock
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Good
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => openAddStock(m)}
                          className="text-xs font-medium text-navy hover:underline"
                        >
                          + Add Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAddModal && (
        <Modal title="Add Material" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddMaterial} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Material Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  {MATERIAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Unit</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Stock *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Minimum Level *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.min_level}
                  onChange={(e) => setForm({ ...form, min_level: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
                <p className="text-xs text-gray-400 mt-1">Alerts when stock falls below this.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {stockTarget && (
        <Modal title={`Add Stock — ${stockTarget.name}`} onClose={() => setStockTarget(null)}>
          <form onSubmit={handleAddStock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Material</label>
              <input
                type="text"
                readOnly
                value={stockTarget.name}
                className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity to Add ({stockTarget.unit}) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={stockForm.quantity}
                onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={stockForm.date}
                onChange={(e) => setStockForm({ ...stockForm, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Note (optional)</label>
              <textarea
                rows={2}
                value={stockForm.note}
                onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setStockTarget(null)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={savingStock}>{savingStock ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
