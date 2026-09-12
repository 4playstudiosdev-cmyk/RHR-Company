import React, { useEffect, useState } from 'react';
import { Tag, Boxes, Download, PackageSearch } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { CITY_IDS, groupByName } from '../utils/multiCityFetch';
import { exportTableToExcel } from './production/exportUtils';

const TABS = [
  { key: 'products', label: 'Finished Products', icon: Tag },
  { key: 'materials', label: 'Raw Materials', icon: Boxes }
];

// Same code->label mapping as production/RawMaterials.jsx — raw_materials.category
// stores lowercase codes ('binder', 'filler', ...), not the pretty names shown
// in the UI there, so this needs to match or a material would show a
// different category name here than on the Raw Materials page itself.
const CATEGORY_LABEL = { binder: 'Cement', filler: 'Sand/Bajri', chemical: 'Chemicals', pigment: 'Pigments', other: 'Other' };

// "IN" for a finished product comes from completed production runs
// crediting it, "OUT" from quantities sold on customer orders — see
// products.controller.js's getStockReport for the real data sources
// (there's no dedicated products movement log, unlike raw materials).
// "Closing balance" is always the item's current live stock, not derived
// by summing history, so it's correct even across any gaps in the above.
export default function StockReports() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [activeTab, setActiveTab] = useState('products');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, activeTab, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const dateParams = { ...(dateFrom ? { from: dateFrom } : {}), ...(dateTo ? { to: dateTo } : {}) };
      const endpoint = activeTab === 'products' ? '/products/reports/stock' : '/production/materials/stock-report';
      const sumFields = ['stockIn', 'stockOut', 'closingBalance', 'minLevel'];

      let data;
      if (selectedCity === 'all') {
        const results = await Promise.all(
          CITY_IDS.map((id) => api.get(endpoint, { params: { ...dateParams, company_id: id } }))
        );
        data = groupByName(results.flatMap((r) => r.data.data || []), sumFields);
      } else {
        const res = await api.get(endpoint, { params: { ...dateParams, company_id: selectedCity } });
        data = res.data.data || [];
      }

      if (activeTab === 'products') setProducts(data);
      else setMaterials(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load stock report.');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const rangeLabel = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'now'}` : 'all-time';
    if (activeTab === 'products') {
      if (products.length === 0) { toast.error('Nothing to export.'); return; }
      exportTableToExcel({
        sheetName: 'Finished Products Stock',
        head: ['Product Name', 'Category', 'Unit', 'Stock In', 'Stock Out', 'Closing Balance', 'Status'],
        rows: products.map((p) => [
          p.name, p.category || '—', p.unit, p.stockIn, p.stockOut, p.closingBalance,
          p.closingBalance > 0 ? 'In Stock' : 'Out of Stock'
        ]),
        filename: `stock-report-products-${rangeLabel}`
      });
    } else {
      if (materials.length === 0) { toast.error('Nothing to export.'); return; }
      exportTableToExcel({
        sheetName: 'Raw Materials Stock',
        head: ['Material Name', 'Category', 'Unit', 'Stock In', 'Stock Out', 'Closing Balance', 'Min Level', 'Status'],
        rows: materials.map((m) => [
          m.name, CATEGORY_LABEL[m.category] || m.category || '—', m.unit, m.stockIn, m.stockOut, m.closingBalance, m.minLevel,
          materialStatus(m).label
        ]),
        filename: `stock-report-materials-${rangeLabel}`
      });
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Stock Reports"
        subtitle="Finished products and raw materials — stock in/out history with closing balance"
        action={
          <div className="flex items-center gap-3">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              <Download size={15} /> Export Excel
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-navy hover:underline pb-2.5"
            >
              Clear (all-time)
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={7} />
      ) : activeTab === 'products' ? (
        <ProductsStockTable products={products} />
      ) : (
        <MaterialsStockTable materials={materials} />
      )}
    </div>
  );
}

function materialStatus(m) {
  if (Number(m.closingBalance) <= 0) return { label: 'Out of Stock', classes: 'bg-red-50 text-red-600' };
  if (m.minLevel > 0 && Number(m.closingBalance) <= Number(m.minLevel)) return { label: 'Low Stock', classes: 'bg-orange/10 text-orange' };
  return { label: 'Good', classes: 'bg-emerald-50 text-emerald-700' };
}

function ProductsStockTable({ products }) {
  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-gray-100">
        <EmptyState icon={PackageSearch} title="No products found" />
      </div>
    );
  }

  const inStock = products.filter((p) => p.closingBalance > 0).length;

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product Name</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Stock In</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Stock Out</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Closing Balance</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-6 py-3.5 font-medium text-navy">{p.name}</td>
                <td className="px-6 py-3.5 text-gray-600">{p.category || '—'}</td>
                <td className="px-6 py-3.5 text-gray-600">{p.unit}</td>
                <td className="px-6 py-3.5 text-right text-emerald-700 font-medium">+{Number(p.stockIn).toLocaleString()}</td>
                <td className="px-6 py-3.5 text-right text-red-600 font-medium">−{Number(p.stockOut).toLocaleString()}</td>
                <td className="px-6 py-3.5 text-right font-bold text-navy">{Number(p.closingBalance).toLocaleString()} {p.unit}</td>
                <td className="px-6 py-3.5">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${p.closingBalance > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {p.closingBalance > 0 ? 'In Stock' : 'Out of Stock'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-navy">
              <td colSpan={3} className="px-6 py-3 text-white font-semibold text-sm">Total Products: {products.length}</td>
              <td colSpan={2} className="px-6 py-3 text-orange font-semibold text-sm">{inStock} In Stock</td>
              <td colSpan={2} className="px-6 py-3 text-red-300 font-semibold text-sm">{products.length - inStock} Out of Stock</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function MaterialsStockTable({ materials }) {
  if (materials.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-gray-100">
        <EmptyState icon={PackageSearch} title="No materials found" />
      </div>
    );
  }

  const outOfStock = materials.filter((m) => Number(m.closingBalance) <= 0).length;
  const lowStock = materials.filter((m) => m.minLevel > 0 && Number(m.closingBalance) > 0 && Number(m.closingBalance) <= Number(m.minLevel)).length;

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material Name</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Stock In</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Stock Out</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Closing Balance</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Min Level</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m, i) => {
              const status = materialStatus(m);
              return (
                <tr key={m.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                  <td className="px-6 py-3.5 font-medium text-navy">{m.name}</td>
                  <td className="px-6 py-3.5 text-gray-600">{CATEGORY_LABEL[m.category] || m.category}</td>
                  <td className="px-6 py-3.5 text-gray-600">{m.unit}</td>
                  <td className="px-6 py-3.5 text-right text-emerald-700 font-medium">+{Number(m.stockIn).toLocaleString()}</td>
                  <td className="px-6 py-3.5 text-right text-red-600 font-medium">−{Number(m.stockOut).toLocaleString()}</td>
                  <td className="px-6 py-3.5 text-right font-bold text-navy">{Number(m.closingBalance).toLocaleString()} {m.unit}</td>
                  <td className="px-6 py-3.5 text-right text-gray-500">{Number(m.minLevel).toLocaleString()} {m.unit}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.classes}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-navy">
              <td colSpan={3} className="px-6 py-3 text-white font-semibold text-sm">Total Materials: {materials.length}</td>
              <td colSpan={3} className="px-6 py-3 text-orange font-semibold text-sm">{lowStock} Low Stock</td>
              <td colSpan={2} className="px-6 py-3 text-red-300 font-semibold text-sm">{outOfStock} Out of Stock</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
