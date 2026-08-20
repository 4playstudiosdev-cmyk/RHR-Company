import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, TrendingDown, PackageSearch, Download, FileSpreadsheet, AlertTriangle, Info } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { exportTableToPDF, exportTableToExcel } from './exportUtils';

const TABS = [
  { key: 'daily', label: 'Daily Production Report', icon: BarChart3 },
  { key: 'consumption', label: 'Raw Material Consumption', icon: TrendingDown },
  { key: 'stock', label: 'Stock Status Report', icon: PackageSearch }
];

function ExportButtons({ onPDF, onExcel }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onPDF}
        className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
      >
        <Download size={14} /> Export PDF
      </button>
      <button
        onClick={onExcel}
        className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
      >
        <FileSpreadsheet size={14} /> Export Excel
      </button>
    </div>
  );
}

// Pads the real (sparse) series out to a continuous 30-day run — missing
// days are genuinely zero production, not fabricated numbers.
function padSeries(series) {
  const byDate = Object.fromEntries((series || []).map((d) => [d.date, d.qty]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    days.push({
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      qty: byDate[iso] || 0
    });
  }
  return days;
}

function DailyProductionReport() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [series, setSeries] = useState([]);
  const [records, setRecords] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/production/reports/daily');
        setSeries(padSeries(res.data.data.series));
        setRecords(res.data.data.records || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load daily production report.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recent = [...records].reverse().slice(0, 15);

  const handlePDF = () => {
    if (recent.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToPDF({
      title: 'Daily Production Report',
      subtitle: 'Recent production orders',
      head: ['Date', 'Product', 'Qty Produced', 'Raw Material Used'],
      rows: recent.map((r) => [r.start_date, r.product_name, `${r.qty} ${r.unit}`, '—']),
      filename: 'daily-production-report'
    });
  };

  const handleExcel = () => {
    if (recent.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToExcel({
      sheetName: 'Daily Production',
      head: ['Date', 'Product', 'Qty Produced', 'Unit', 'Raw Material Used'],
      rows: recent.map((r) => [r.start_date, r.product_name, r.qty, r.unit, '—']),
      filename: 'daily-production-report'
    });
  };

  if (loading) return <SkeletonTable rows={6} cols={4} />;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>;

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-navy">Production Volume — Last 30 Days</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Total qty across production orders started per day, all products combined
            </p>
          </div>
          <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="qty" fill="#E8841A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-navy text-sm">Recent Production Log</h3>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon={BarChart3} title="No production orders yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Qty Produced</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Raw Material Used</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3 text-gray-500">{r.start_date}</td>
                    <td className="px-6 py-3 text-gray-700">{r.product_name}</td>
                    <td className="px-6 py-3 text-right text-navy font-medium">{r.qty} {r.unit}</td>
                    <td className="px-6 py-3 text-gray-400">—</td>
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

function RawMaterialConsumptionReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/production/reports/consumption');
        setMaterials(res.data.data.materials || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load consumption report.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SkeletonTable rows={6} cols={4} />;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>;

  return (
    <div>
      <div className="bg-gray-100 border border-gray-200 rounded-2xl p-5 flex items-start gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0">
          <Info size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-navy text-sm mb-1">Consumption Tracking Not Available Yet</h3>
          <p className="text-sm text-gray-500">
            Material consumption per product requires recipes (a bill of materials), which aren't configured yet.
            Add recipes in Settings to see real usage trends here. Current stock is shown below for reference.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-navy text-sm">Current Raw Material Stock</h3>
        </div>
        {materials.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No raw materials configured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Current Stock</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={m.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3 text-navy font-medium">{m.name}</td>
                    <td className="px-6 py-3 text-gray-600">{m.category}</td>
                    <td className="px-6 py-3 text-right text-gray-700">{Number(m.stock).toLocaleString()} {m.unit}</td>
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

function stockLevel(material) {
  if (Number(material.stock) < Number(material.min_level)) return 'red';
  if (Number(material.stock) < Number(material.min_level) * 1.5) return 'yellow';
  return 'green';
}

const LEVEL_STYLE = {
  green: { row: '', badge: 'bg-green-100 text-green-800', label: 'Good' },
  yellow: { row: 'bg-yellow-50/60', badge: 'bg-yellow-100 text-yellow-800', label: 'Watch' },
  red: { row: 'bg-red-50/60', badge: 'bg-red-100 text-red-800', label: 'Low' }
};

function StockStatusReport() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/production/reports/stock');
      setMaterials(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load stock status report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reorderList = materials.filter((m) => stockLevel(m) === 'red').map((m) => ({
    ...m,
    suggested: Math.max(0, Number(m.min_level) * 2 - Number(m.stock))
  }));

  const handlePDF = () => {
    if (materials.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToPDF({
      title: 'Stock Status Report',
      subtitle: 'Current raw material stock levels',
      head: ['Material', 'Category', 'In Stock', 'Min Level', 'Status'],
      rows: materials.map((m) => [m.name, m.category, `${m.stock} ${m.unit}`, `${m.min_level} ${m.unit}`, LEVEL_STYLE[stockLevel(m)].label]),
      filename: 'stock-status-report'
    });
  };

  const handleExcel = () => {
    if (materials.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToExcel({
      sheetName: 'Stock Status',
      head: ['Material', 'Category', 'In Stock', 'Min Level', 'Status'],
      rows: materials.map((m) => [m.name, m.category, m.stock, m.min_level, LEVEL_STYLE[stockLevel(m)].label]),
      filename: 'stock-status-report'
    });
  };

  if (loading) return <SkeletonTable rows={6} cols={5} />;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>;

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-navy">Current Stock — All Raw Materials</h3>
            <p className="text-xs text-gray-400 mt-0.5">Green = good · Yellow = watch · Red = low, reorder soon</p>
          </div>
          <ExportButtons onPDF={handlePDF} onExcel={handleExcel} />
        </div>
        {materials.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No raw materials configured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Material</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">In Stock</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Min Level</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m, i) => {
                  const level = stockLevel(m);
                  const style = LEVEL_STYLE[level];
                  return (
                    <tr key={m.id} className={`border-b border-gray-50 last:border-0 ${style.row || (i % 2 === 1 ? 'bg-gray-50/40' : '')}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{m.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{m.category}</td>
                      <td className="px-6 py-3.5 text-right text-gray-700">{Number(m.stock).toLocaleString()} {m.unit}</td>
                      <td className="px-6 py-3.5 text-right text-gray-500">{Number(m.min_level).toLocaleString()} {m.unit}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${style.badge}`}>
                          {style.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={18} className="text-red-600" />
          <h3 className="font-semibold text-red-800 text-sm">Reorder Suggestions</h3>
        </div>
        {reorderList.length === 0 ? (
          <p className="text-sm text-red-700/70">Nothing below minimum level right now.</p>
        ) : (
          <div className="space-y-2">
            {reorderList.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm bg-white/60 rounded-lg px-4 py-2.5">
                <span className="text-red-900 font-medium">{m.name}</span>
                <span className="text-red-700">
                  {m.stock} {m.unit} in stock — suggest ordering <strong>{m.suggested} {m.unit}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProductionReports() {
  const [tab, setTab] = useState('daily');

  return (
    <div className="p-6">
      <PageHeader title="Production Reports" subtitle="Daily output, material consumption and stock status" />

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

      {tab === 'daily' && <DailyProductionReport />}
      {tab === 'consumption' && <RawMaterialConsumptionReport />}
      {tab === 'stock' && <StockStatusReport />}
    </div>
  );
}
