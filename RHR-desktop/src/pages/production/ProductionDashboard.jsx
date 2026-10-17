import React, { useEffect, useState } from 'react';
import { Boxes, Scale, Coins, AlertTriangle, Download, FileSpreadsheet, Inbox, PlusCircle } from 'lucide-react';
import api, { getCurrentUser } from '../../services/api';
import EmptyState from '../../components/EmptyState';
import CityFilter from '../../components/CityFilter';
import DateRangeFilter from '../../components/DateRangeFilter';
import { SkeletonStatCards, SkeletonTable } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { exportTableToPDF, exportTableToExcel } from './exportUtils';
import {
  DayBreakdownTable, useProductionSummary, todayISO, fmtNum, fmtKg,
  unitBreakdown, rangeLabel, summaryExportRows
} from './ProductionSummary';

const CARD_COLORS = {
  orange: 'bg-orange/10 text-orange',
  red: 'bg-red-50 text-red-600',
  green: 'bg-emerald-50 text-emerald-600',
  blue: 'bg-navy-chip text-navy'
};

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-card hover:shadow-md transition-shadow border border-gray-100 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${CARD_COLORS[color]}`}>
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-navy leading-tight truncate">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function categoryTotal(cat) {
  return cat.items.reduce((sum, item) => sum + Number(item.qty), 0);
}

export default function ProductionDashboard({ setPage }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  // Production is shown for a date range (default: today), like every
  // other report-style page.
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const { data: summary, loading: summaryLoading, error: summaryError } =
    useProductionSummary({ from: range.from, to: range.to, companyFilter });

  const [demandLoading, setDemandLoading] = useState(true);
  const [demandError, setDemandError] = useState('');
  const [demand, setDemand] = useState([]);
  const [lowStock, setLowStock] = useState(0);

  useEffect(() => {
    (async () => {
      setDemandLoading(true);
      setDemandError('');
      try {
        const params = companyFilter ? { company_id: companyFilter } : {};
        const [demandRes, materialsRes] = await Promise.all([
          api.get('/production/demand', { params }),
          api.get('/production/materials', { params })
        ]);
        setDemand(demandRes.data.data || []);
        const materials = materialsRes.data.data || [];
        setLowStock(materials.filter((m) => Number(m.stock) < Number(m.min_level)).length);
      } catch (err) {
        setDemandError(err.response?.data?.message || 'Failed to load production demand.');
      } finally {
        setDemandLoading(false);
      }
    })();
  }, [companyFilter]);

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

  // "Export Report" exports what was produced in the selected date range.
  const handleExportExcel = () => {
    const rows = summaryExportRows(summary?.days);
    if (rows.length === 0) { toast.error('No production in this period to export.'); return; }
    exportTableToExcel({
      sheetName: 'Production',
      head: ['Date', 'Product', 'Qty Produced', 'Unit', 'Weight (kg)', 'Cost (PKR)'],
      rows,
      filename: `production-${range.from || 'all'}-${range.to || 'all'}`
    });
  };

  const totals = summary?.totals;
  const loading = summaryLoading || demandLoading;
  const error = summaryError || demandError;

  return (
    <div className="p-6">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Production Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">What was produced, and what's still needed for pending orders.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <DateRangeFilter
            from={range.from}
            to={range.to}
            defaultPreset="Today"
            onApply={(from, to) => setRange({ from, to })}
          />
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 border border-gray-200 bg-white text-navy hover:bg-gray-50 text-sm font-medium px-3.5 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Download size={15} /> Export Report
          </button>
          {setPage && (
            <button
              onClick={() => setPage('production-daily')}
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
            <StatCard
              label="Produced"
              value={unitBreakdown(totals?.by_unit)}
              sub={`${fmtNum(totals?.runs)} production run${totals?.runs === 1 ? '' : 's'} · ${rangeLabel(range.from, range.to)}`}
              icon={Boxes}
              color="orange"
            />
            <StatCard
              label="Weight Produced"
              value={`${fmtKg(totals?.kg)} kg`}
              sub="By recipe weight"
              icon={Scale}
              color="green"
            />
            <StatCard
              label="Production Cost"
              value={`PKR ${fmtNum(totals?.cost)}`}
              sub="Raw materials + overheads"
              icon={Coins}
              color="blue"
            />
            <StatCard label="Low Stock Items" value={lowStock} icon={AlertTriangle} color="red" />
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-navy">Production — Day by Day</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Everything logged in Daily Production Entry for {rangeLabel(range.from, range.to).toLowerCase()}
              </p>
            </div>
            <DayBreakdownTable days={summary?.days} />
          </div>

          {/* Demand table */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
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
        </>
      )}
    </div>
  );
}
