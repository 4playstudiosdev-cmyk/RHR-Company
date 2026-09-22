import React, { useEffect, useMemo, useState } from 'react';
import { Plus, AlertCircle, PackagePlus, Pencil, Trash2, ShoppingCart, X, ScanLine } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { getCurrentUser } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import CityFilter from '../../components/CityFilter';
import { fetchAllCities } from '../../utils/multiCityFetch';

// Labels shown in the UI vs. the actual lowercase codes stored in
// raw_materials.category — tabs/filter/form all used to compare against
// the pretty label directly, which never matched a real row's category
// (always "binder"/"filler"/etc in the DB), so every tab but "All" and
// every newly-added material silently mismatched.
const MATERIAL_CATEGORIES = [
  { label: 'Cement', value: 'binder' },
  { label: 'Sand/Bajri', value: 'filler' },
  { label: 'Chemicals', value: 'chemical' },
  { label: 'Pigments', value: 'pigment' },
  { label: 'Packaging', value: 'packaging' },
  { label: 'Other', value: 'other' },
];
const CATEGORY_LABEL = Object.fromEntries(MATERIAL_CATEGORIES.map((c) => [c.value, c.label]));
const UNITS = ['kg', 'litre', 'piece', 'bag'];
const EMPTY_FORM = { name: '', category: MATERIAL_CATEGORIES[0].value, unit: UNITS[0], stock: '', min_level: '' };
const EMPTY_STOCK_FORM = { quantity: '', date: new Date().toISOString().split('T')[0], note: '' };
const EMPTY_PURCHASE_ROW = { raw_material_id: '', qty: '', price_per_unit: '' };

export default function RawMaterials() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm, setStockForm] = useState(EMPTY_STOCK_FORM);
  const [savingStock, setSavingStock] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState([{ ...EMPTY_PURCHASE_ROW }]);
  const [supplierName, setSupplierName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    setTab('All');
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadMaterials = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const data = companyFilter
        ? (await api.get('/production/materials', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/production/materials');
      setMaterials(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load raw materials.');
    } finally {
      setLoading(false);
    }
  };

  // "All Cities" combines each branch's own copy of the same materials
  // list — group by name and sum stock/min_level so it reads as one
  // company-wide inventory total instead of 3 duplicate rows per material.
  const isCombined = selectedCity === 'all';
  const groupedMaterials = useMemo(() => {
    if (!isCombined) return materials;
    const byName = new Map();
    materials.forEach((m) => {
      const key = m.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...m, stock: Number(m.stock) || 0, min_level: Number(m.min_level) || 0 });
      } else {
        existing.stock += Number(m.stock) || 0;
        existing.min_level += Number(m.min_level) || 0;
      }
    });
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [materials, isCombined]);

  const tabs = [{ label: 'All', value: 'All' }, ...MATERIAL_CATEGORIES];
  const filtered = tab === 'All' ? groupedMaterials : groupedMaterials.filter((m) => m.category === tab);

  const openEditModal = (material) => {
    setEditingMaterial(material);
    setForm({
      name: material.name || '',
      category: material.category || MATERIAL_CATEGORIES[0].value,
      unit: material.unit || UNITS[0],
      stock: material.stock ?? '',
      min_level: material.min_level ?? ''
    });
    setShowAddModal(true);
  };

  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    if (!form.name || form.stock === '' || form.min_level === '') {
      toast.error('Material name, current stock and minimum level are required.');
      return;
    }
    setSaving(true);
    try {
      if (editingMaterial) {
        await api.patch(`/production/materials/${editingMaterial.id}`, {
          name: form.name,
          category: form.category,
          unit: form.unit,
          stock: Number(form.stock),
          min_level: Number(form.min_level)
        });
        toast.success('Material updated.');
      } else {
        await api.post('/production/materials', {
          name: form.name,
          category: form.category,
          unit: form.unit,
          stock: Number(form.stock),
          min_level: Number(form.min_level)
        });
        toast.success('Material added.');
      }
      setShowAddModal(false);
      setEditingMaterial(null);
      setForm(EMPTY_FORM);
      loadMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save material.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async (material) => {
    const confirmed = window.confirm(
      `Delete "${material.name}"?\n` +
      `This will remove it from Raw Materials — existing recipes/history that reference it are kept, but it won't be usable in new ones.`
    );
    if (!confirmed) return;
    try {
      await api.delete(`/production/materials/${material.id}`);
      toast.success('Material deleted.');
      loadMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete material.');
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

  const openPurchaseModal = () => {
    setPurchaseItems([{ ...EMPTY_PURCHASE_ROW }]);
    setSupplierName('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setShowPurchaseModal(true);
  };

  // Invoice upload → OCR (Claude, proxied through the backend) → drops
  // extracted rows straight into the same editable purchaseItems table
  // the manual-entry flow already uses, so confirming/submitting is
  // identical either way — the admin can still fix anything OCR got wrong.
  const handleInvoiceUpload = async (file) => {
    if (!file) return;
    setIsExtracting(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await api.post('/production/materials/ocr-extract', {
        image_base64: base64,
        media_type: file.type || 'image/jpeg'
      });

      const items = res.data.data?.items || [];
      if (!items.length) {
        toast.error('No items found in the invoice — add them manually.');
        return;
      }
      setPurchaseItems(items.map((item) => ({
        raw_material_id: item.raw_material_id || '',
        qty: item.quantity || '',
        price_per_unit: item.price_per_unit || ''
      })));
      const unmatched = items.filter((item) => !item.raw_material_id).length;
      toast.success(
        unmatched > 0
          ? `Extracted ${items.length} item${items.length > 1 ? 's' : ''} — ${unmatched} need${unmatched === 1 ? 's' : ''} a material selected manually.`
          : `Extracted ${items.length} item${items.length > 1 ? 's' : ''} from the invoice.`
      );
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not read the invoice — add items manually.');
    } finally {
      setIsExtracting(false);
    }
  };

  const updatePurchaseRow = (index, field, value) => {
    setPurchaseItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addPurchaseRow = () => setPurchaseItems((prev) => [...prev, { ...EMPTY_PURCHASE_ROW }]);

  const removePurchaseRow = (index) => setPurchaseItems((prev) => prev.filter((_, i) => i !== index));

  const purchaseTotal = purchaseItems.reduce(
    (sum, row) => sum + (Number(row.qty) || 0) * (Number(row.price_per_unit) || 0),
    0
  );

  const generatePurchaseInvoice = (purchase) => {
    const doc = new jsPDF();

    doc.setFillColor(27, 46, 107);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RHR & COMPANY', 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Construction Materials Manufacturer', 14, 22);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE INVOICE', 196, 18, { align: 'right' });

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Date: ${new Date(purchase.purchase_date).toLocaleDateString('en-GB')}`, 14, 42);
    doc.text(`Supplier: ${purchase.supplier_name || 'Direct Purchase'}`, 14, 48);

    const rows = purchase.items.map((item, i) => [
      i + 1,
      item.name,
      `${item.qty} ${item.unit}`,
      `PKR ${Number(item.price_per_unit).toLocaleString()}`,
      `PKR ${Number(item.total).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 58,
      head: [['#', 'Material', 'Qty', 'Unit Price', 'Total']],
      body: rows,
      headStyles: { fillColor: [27, 46, 107] },
      styles: { fontSize: 9 },
      foot: [['', '', '', 'Grand Total', `PKR ${Number(purchase.grand_total).toLocaleString()}`]],
      footStyles: { fillColor: [232, 132, 26], textColor: 255, fontStyle: 'bold' }
    });

    doc.save(`purchase-invoice-${purchase.purchase_id.slice(0, 8)}.pdf`);
  };

  const handlePurchase = async (e) => {
    e.preventDefault();
    const valid = purchaseItems.filter((r) => r.raw_material_id && r.qty && r.price_per_unit);
    if (!valid.length) {
      toast.error('Add at least one material with quantity and price.');
      return;
    }
    setSavingPurchase(true);
    try {
      const res = await api.post('/production/materials/purchase', {
        items: valid.map((r) => ({
          raw_material_id: r.raw_material_id,
          qty: Number(r.qty),
          price_per_unit: Number(r.price_per_unit)
        })),
        supplier_name: supplierName || null,
        purchase_date: purchaseDate
      });
      generatePurchaseInvoice(res.data.data);
      toast.success('Purchase recorded — stock updated.');
      setShowPurchaseModal(false);
      loadMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record purchase.');
    } finally {
      setSavingPurchase(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Raw Materials Stock"
        subtitle="Track raw material inventory used in production"
        action={
          <div className="flex items-center gap-3">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            {isCombined ? (
              <span className="text-xs text-gray-400" title="Select a specific city to record a purchase">
                Select a city to record purchases
              </span>
            ) : (
              <Button variant="primary" onClick={openPurchaseModal} className="flex items-center gap-2">
                <ShoppingCart size={16} /> Purchase
              </Button>
            )}
            <Button
              variant="accent"
              onClick={() => { setEditingMaterial(null); setForm(EMPTY_FORM); setShowAddModal(true); }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Add Material
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
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
            <div className="overflow-x-auto">
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
                      <td className="px-6 py-3.5 text-gray-600">{CATEGORY_LABEL[m.category] || m.category}</td>
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
                        {isCombined ? (
                          <span className="text-xs text-gray-400" title="Select a specific city to manage one branch's material">
                            Select a city to manage
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => openAddStock(m)}
                              className="text-xs font-medium text-navy hover:underline"
                            >
                              + Add Stock
                            </button>
                            <button
                              onClick={() => openEditModal(m)}
                              className="text-navy hover:bg-navy/10 p-1.5 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteMaterial(m)}
                              className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <Modal title={editingMaterial ? 'Edit Material' : 'Add Material'} onClose={() => { setShowAddModal(false); setEditingMaterial(null); }}>
          <form onSubmit={handleSaveMaterial} className="space-y-4">
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
                    <option key={c.value} value={c.value}>{c.label}</option>
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
              <Button type="button" variant="secondary" onClick={() => { setShowAddModal(false); setEditingMaterial(null); }}>Cancel</Button>
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

      {showPurchaseModal && (
        <Modal title="Purchase Raw Materials" onClose={() => setShowPurchaseModal(false)}>
          <form onSubmit={handlePurchase} className="space-y-4">
            <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-4 cursor-pointer transition-colors ${
              isExtracting ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait' : 'border-orange/40 text-orange hover:bg-orange/5'
            }`}>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isExtracting}
                onChange={(e) => { handleInvoiceUpload(e.target.files[0]); e.target.value = ''; }}
              />
              <ScanLine size={16} />
              <span className="text-sm font-medium">{isExtracting ? 'Reading invoice...' : 'Scan an invoice to auto-fill items (optional)'}</span>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Al-Noor Chemicals"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Purchase Date</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Items</label>
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 mb-1.5">
                <span className="text-xs font-semibold text-gray-400">Material</span>
                <span className="text-xs font-semibold text-gray-400">Qty</span>
                <span className="text-xs font-semibold text-gray-400">Price/Unit</span>
                <span></span>
              </div>
              <div className="space-y-2">
                {purchaseItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                    <select
                      value={item.raw_material_id}
                      onChange={(e) => updatePurchaseRow(index, 'raw_material_id', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                    >
                      <option value="">— Select —</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updatePurchaseRow(index, 'qty', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="PKR"
                      value={item.price_per_unit}
                      onChange={(e) => updatePurchaseRow(index, 'price_per_unit', e.target.value)}
                      className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    <button
                      type="button"
                      onClick={() => removePurchaseRow(index)}
                      disabled={purchaseItems.length === 1}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Remove row"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPurchaseRow}
                className="w-full mt-2 py-2 border border-dashed border-orange text-orange rounded-lg text-sm font-medium hover:bg-orange/5 transition-colors"
              >
                + Add Material
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg px-4 py-3 flex justify-end">
              <span className="font-semibold text-navy">Total: PKR {purchaseTotal.toLocaleString()}</span>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowPurchaseModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={savingPurchase}>
                {savingPurchase ? 'Saving...' : 'Confirm Purchase & Generate Invoice'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
