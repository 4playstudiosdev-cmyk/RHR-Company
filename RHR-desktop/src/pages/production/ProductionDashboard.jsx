import React, { useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle, Truck, CheckCircle2, Download, FileSpreadsheet, Info, Inbox } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { SkeletonStatCards, SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { exportTableToPDF, exportTableToExcel } from './exportUtils';

const CARD_COLORS = {
  orange: 'bg-orange/10 text-orange',
  red: 'bg-red-100 text-red-600',
  green: 'bg-green-100 text-green-600',
  blue: 'bg-blue-100 text-blue-600'
};

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${CARD_COLORS[color]}`}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div>
        <p className="text-2xl font-bold text-navy leading-tight">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function categoryTotal(cat) {
  return cat.items.reduce((sum, item) => sum + Number(item.qty), 0);
}

export default function ProductionDashboard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [demand, setDemand] = useState([]);
  const [stats, setStats] = useState({ todayOrders: 0, lowStock: 0, readyToDispatch: 0, completedToday: 0 });

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [demandRes, ordersRes, materialsRes] = await Promise.all([
        api.get('/production/demand'),
        api.get('/production/orders'),
        api.get('/production/materials')
      ]);

      setDemand(demandRes.data.data || []);

      const orders = ordersRes.data.data || [];
      const materials = materialsRes.data.data || [];
      const todayStr = new Date().toISOString().split('T')[0];

      setStats({
        todayOrders: orders.filter((o) => o.start_date === todayStr).length,
        lowStock: materials.filter((m) => Number(m.stock) < Number(m.min_level)).length,
        readyToDispatch: orders.filter((o) => o.status === 'ready').length,
        completedToday: orders.filter(
          (o) => o.start_date === todayStr && (o.status === 'ready' || o.status === 'dispatched')
        ).length
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load production dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const flatRows = demand.flatMap((cat) => cat.items.map((item) => [item.product, item.qty, item.unit]));

  const handleExportPDF = () => {
    if (flatRows.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToPDF({
      title: 'Production Demand — Outstanding Orders',
      subtitle: 'Auto-calculated from orders not yet dispatched',
      head: ['Product', 'Required Qty', 'Unit'],
      rows: flatRows,
      filename: 'production-demand'
    });
  };

  const handleExportExcel = () => {
    if (flatRows.length === 0) { toast.error('Nothing to export.'); return; }
    exportTableToExcel({
      sheetName: 'Production Demand',
      head: ['Product', 'Required Qty', 'Unit'],
      rows: flatRows,
      filename: 'production-demand'
    });
  };

  return (
    <div className="p-6">
      <PageHeader title="Production Dashboard" subtitle="Overview of production demand and floor status" />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={6} cols={3} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard label="Today's Production Orders" value={stats.todayOrders} icon={ClipboardList} color="orange" />
            <StatCard label="Raw Materials Low Stock" value={stats.lowStock} icon={AlertTriangle} color="red" />
            <StatCard label="Ready to Dispatch" value={stats.readyToDispatch} icon={Truck} color="green" />
            <StatCard label="Completed Today" value={stats.completedToday} icon={CheckCircle2} color="blue" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-navy">Production Demand — Outstanding Orders</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Auto-calculated from customer orders not yet dispatched
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                >
                  <Download size={14} /> Export PDF
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                >
                  <FileSpreadsheet size={14} /> Export Excel
                </button>
              </div>
            </div>

            {demand.length === 0 ? (
              <EmptyState icon={Inbox} title="No outstanding production demand" subtitle="All customer orders are dispatched or delivered" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Required Qty</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.map((cat) => (
                    <React.Fragment key={cat.category}>
                      <tr className="bg-navy/5">
                        <td colSpan={3} className="px-6 py-2 font-bold text-navy text-xs uppercase tracking-wide">
                          {cat.category}
                        </td>
                      </tr>
                      {cat.items.map((item, i) => (
                        <tr
                          key={item.product}
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3 text-gray-700 pl-10">{item.product}</td>
                          <td className="px-6 py-3 text-gray-600 text-right">{Number(item.qty).toLocaleString()}</td>
                          <td className="px-6 py-3 text-gray-500">{item.unit}</td>
                        </tr>
                      ))}
                      <tr className="border-b border-gray-100">
                        <td className="px-6 py-3 font-bold text-orange pl-10">Total {cat.category}</td>
                        <td className="px-6 py-3 font-bold text-orange text-right">
                          {categoryTotal(cat).toLocaleString()}
                        </td>
                        <td className="px-6 py-3 font-bold text-orange">{cat.items[0]?.unit}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-gray-100 border border-gray-200 rounded-2xl p-5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0">
              <Info size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-navy text-sm mb-1">Raw Materials Needed (Recipes TBD)</h3>
              <p className="text-sm text-gray-500">
                Product recipes not configured yet. Add recipes in Settings to see raw material calculations.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
