import React, { useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle, Truck, CheckCircle2, Download, FileSpreadsheet, Info, Inbox, PlusCircle } from 'lucide-react';
import api from '../../services/api';
import EmptyState from '../../components/EmptyState';
import { SkeletonStatCards, SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { exportTableToPDF, exportTableToExcel } from './exportUtils';

const CARD_COLORS = {
  orange: 'bg-orange/10 text-orange',
  red: 'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-navy-chip text-navy'
};

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-card hover:shadow-md transition-shadow border border-gray-100 p-5 flex items-center gap-4">
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

export default function ProductionDashboard({ setPage }) {
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
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Production Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of production demand and floor status.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 border border-gray-200 bg-white text-navy hover:bg-gray-50 text-sm font-medium px-3.5 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Download size={15} /> Export Report
          </button>
          {setPage && (
            <button
              onClick={() => setPage('production-orders')}
              className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 text-white text-sm font-medium px-3.5 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <PlusCircle size={15} /> New Batch
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={6} cols={3} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <StatCard label="Today's Orders" value={stats.todayOrders} icon={ClipboardList} color="orange" />
            <StatCard label="Low Stock Items" value={stats.lowStock} icon={AlertTriangle} color="red" />
            <StatCard label="Ready to Dispatch" value={stats.readyToDispatch} icon={Truck} color="green" />
            <StatCard label="Completed Today" value={stats.completedToday} icon={CheckCircle2} color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Demand table */}
            <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between bg-gray-50/50">
                <div>
                  <h2 className="font-semibold text-navy">Production Demand — Pending Orders</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Auto-calculated from customer orders not yet dispatched
                  </p>
                </div>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                  title="Export PDF"
                >
                  <FileSpreadsheet size={14} /> PDF
                </button>
              </div>

              {demand.length === 0 ? (
                <EmptyState icon={Inbox} title="No outstanding production demand" subtitle="All customer orders are dispatched or delivered" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product Name</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Qty Reqd.</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Unit</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.map((cat) => (
                        <React.Fragment key={cat.category}>
                          <tr className="bg-navy-chip/30">
                            <td colSpan={4} className="px-6 py-2 font-bold text-navy text-xs uppercase tracking-wide">
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
                              <td className="px-6 py-3">
                                <span className="inline-block px-2.5 py-1 rounded-full bg-orange/10 text-orange text-[11px] font-semibold">
                                  Pending
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr className="border-b border-gray-100">
                            <td className="px-6 py-3 font-bold text-orange pl-10">Total {cat.category}</td>
                            <td className="px-6 py-3 font-bold text-orange text-right">
                              {categoryTotal(cat).toLocaleString()}
                            </td>
                            <td className="px-6 py-3 font-bold text-orange">{cat.items[0]?.unit}</td>
                            <td />
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <div className="bg-orange-50 border border-orange/30 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange/10 text-orange flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy text-sm">Recipe Configuration Required</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Product recipes aren't configured yet, so raw-material consumption can't be calculated automatically. Add recipes in Settings to enable it.
                    </p>
                  </div>
                </div>
                {setPage && (
                  <button
                    onClick={() => setPage('production-materials')}
                    className="w-full bg-orange hover:bg-orange/90 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    Manage Raw Materials
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
