import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Wallet, ShoppingCart, Download, RefreshCw, ArrowUp, ArrowDown, Receipt
} from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const REPORT_TABS = [
  { key: 'sales', label: 'Sales Report', icon: TrendingUp },
  { key: 'collections', label: 'Collections', icon: Wallet },
  { key: 'outstanding', label: 'Outstanding', icon: Receipt }
];

const toISODate = (d) => d.toISOString().split('T')[0];
const defaultFrom = () => { const d = new Date(); d.setDate(d.getDate() - 29); return toISODate(d); };
const defaultTo = () => toISODate(new Date());

function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function TrendBadge({ value }) {
  if (!isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function Reports() {
  const toast = useToast();
  const [reportTab, setReportTab] = useState('sales');
  const [fromDate, setFromDate] = useState(defaultFrom());
  const [toDate, setToDate] = useState(defaultTo());
  const [applied, setApplied] = useState({ from: defaultFrom(), to: defaultTo() });

  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outstandingLoading, setOutstandingLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [outPage, setOutPage] = useState(1);

  useEffect(() => {
    loadData();
    loadOutstanding();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersRes, paymentsRes] = await Promise.all([api.get('/orders'), api.get('/payments')]);
      setOrders(ordersRes.data.data || []);
      setPayments(paymentsRes.data.data || []);
    } catch (err) {
      toast.error('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  const loadOutstanding = async () => {
    setOutstandingLoading(true);
    try {
      const res = await api.get('/reports/outstanding');
      setOutstanding(res.data.data || []);
    } catch (err) {
      // non-fatal — Sales/Collections tabs still work
    } finally {
      setOutstandingLoading(false);
    }
  };

  const handleGenerate = () => setApplied({ from: fromDate, to: toDate });

  const handleExport = async (type) => {
    setDownloading(true);
    try {
      const res = await api.get('/reports/export', { params: { type }, responseType: 'blob' });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded.');
    } catch (err) {
      toast.error('Failed to generate report.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Range math ──
  const rangeMs = useMemo(() => {
    const from = new Date(applied.from);
    const to = new Date(applied.to);
    to.setHours(23, 59, 59, 999);
    return { from, to, spanMs: to - from };
  }, [applied]);

  const inRange = (dateStr, from, to) => {
    const t = new Date(dateStr).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };

  const ordersInRange = useMemo(
    () => orders.filter((o) => inRange(o.created_at, rangeMs.from, rangeMs.to)),
    [orders, rangeMs]
  );
  const prevOrders = useMemo(() => {
    const prevTo = new Date(rangeMs.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - rangeMs.spanMs);
    return orders.filter((o) => inRange(o.created_at, prevFrom, prevTo));
  }, [orders, rangeMs]);

  const paymentsInRange = useMemo(
    () => payments.filter((p) => p.status === 'approved' && inRange(p.created_at, rangeMs.from, rangeMs.to)),
    [payments, rangeMs]
  );
  const prevPayments = useMemo(() => {
    const prevTo = new Date(rangeMs.from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - rangeMs.spanMs);
    return payments.filter((p) => p.status === 'approved' && inRange(p.created_at, prevFrom, prevTo));
  }, [payments, rangeMs]);

  const totalSales = ordersInRange.reduce((s, o) => s + Number(o.total_amount), 0);
  const prevSales = prevOrders.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalOrders = ordersInRange.length;
  const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
  const prevAvgOrderValue = prevOrders.length > 0 ? prevSales / prevOrders.length : 0;

  const totalCollected = paymentsInRange.reduce((s, p) => s + Number(p.amount), 0);
  const prevCollected = prevPayments.reduce((s, p) => s + Number(p.amount), 0);

  // ── Weekly buckets across the selected range ──
  const weeklySales = useMemo(() => {
    const weeks = Math.max(1, Math.ceil(rangeMs.spanMs / (7 * 24 * 60 * 60 * 1000)));
    const buckets = Array.from({ length: weeks }, () => 0);
    ordersInRange.forEach((o) => {
      const idx = Math.min(weeks - 1, Math.floor((new Date(o.created_at) - rangeMs.from) / (7 * 24 * 60 * 60 * 1000)));
      buckets[idx] += Number(o.total_amount);
    });
    return buckets;
  }, [ordersInRange, rangeMs]);

  const topProducts = useMemo(() => {
    const map = new Map();
    ordersInRange.forEach((o) => {
      (o.order_items || []).forEach((item) => {
        const key = item.product_name;
        if (!map.has(key)) map.set(key, { name: key, revenue: 0, orders: 0 });
        const entry = map.get(key);
        entry.revenue += Number(item.subtotal);
        entry.orders += 1;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [ordersInRange]);

  const methodBreakdown = useMemo(() => {
    const map = {};
    paymentsInRange.forEach((p) => { map[p.method] = (map[p.method] || 0) + Number(p.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [paymentsInRange]);

  const OUT_PAGE_SIZE = 10;
  const outstandingFiltered = outstanding.filter((o) => o.outstanding > 0);
  const outTotalPages = Math.max(1, Math.ceil(outstandingFiltered.length / OUT_PAGE_SIZE));
  const outPageRows = outstandingFiltered.slice((outPage - 1) * OUT_PAGE_SIZE, outPage * OUT_PAGE_SIZE);
  const totalOutstanding = outstandingFiltered.reduce((s, o) => s + Number(o.outstanding), 0);

  const maxWeekly = Math.max(...weeklySales, 1);
  const maxProductRevenue = Math.max(...topProducts.map((p) => p.revenue), 1);
  const maxMethod = Math.max(...methodBreakdown.map(([, v]) => v), 1);

  return (
    <div className="p-6">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Comprehensive financial and operational insights.</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={defaultTo()}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> Generate
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {REPORT_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setReportTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                reportTab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : reportTab === 'sales' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Sales</p>
                  <p className="text-2xl font-bold text-navy mt-1">PKR {totalSales.toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-navy-chip text-navy flex items-center justify-center"><TrendingUp size={18} /></div>
              </div>
              <div className="mt-2"><TrendBadge value={pctChange(totalSales, prevSales)} /> <span className="text-xs text-gray-400 ml-1">vs previous period</span></div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Orders</p>
                  <p className="text-2xl font-bold text-navy mt-1">{totalOrders}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-navy-chip text-navy flex items-center justify-center"><ShoppingCart size={18} /></div>
              </div>
              <div className="mt-2"><TrendBadge value={pctChange(totalOrders, prevOrders.length)} /> <span className="text-xs text-gray-400 ml-1">vs previous period</span></div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg Order Value</p>
                  <p className="text-2xl font-bold text-navy mt-1">PKR {Math.round(avgOrderValue).toLocaleString()}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-orange/10 text-orange flex items-center justify-center"><Receipt size={18} /></div>
              </div>
              <div className="mt-2"><TrendBadge value={pctChange(avgOrderValue, prevAvgOrderValue)} /> <span className="text-xs text-gray-400 ml-1">vs previous period</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-semibold text-navy text-sm">Sales Volume</h3>
                <button
                  onClick={() => handleExport('sales')}
                  disabled={downloading}
                  className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Download size={13} /> Export
                </button>
              </div>
              {weeklySales.every((v) => v === 0) ? (
                <EmptyState icon={TrendingUp} title="No sales in this period" />
              ) : (
                <div className="flex items-end justify-around gap-3 h-48">
                  {weeklySales.map((v, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full justify-end group relative">
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                        PKR {v.toLocaleString()}
                      </div>
                      <div className="w-full max-w-[48px] bg-navy rounded-t-md transition-all" style={{ height: `${Math.max((v / maxWeekly) * 100, v > 0 ? 6 : 2)}%` }} />
                      <span className="text-xs text-gray-400">W{i + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy text-sm mb-4">Top Products</h3>
              {topProducts.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="No product sales in this period" />
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p) => (
                    <div key={p.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium truncate max-w-[160px]">{p.name}</span>
                        <span className="text-navy font-semibold">PKR {p.revenue.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-orange h-full rounded-full" style={{ width: `${(p.revenue / maxProductRevenue) * 100}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{p.orders} order line{p.orders > 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : reportTab === 'collections' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Collected</p>
              <p className="text-2xl font-bold text-navy mt-1">PKR {totalCollected.toLocaleString()}</p>
              <div className="mt-2"><TrendBadge value={pctChange(totalCollected, prevCollected)} /> <span className="text-xs text-gray-400 ml-1">vs previous period</span></div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Payments Recorded</p>
              <p className="text-2xl font-bold text-navy mt-1">{paymentsInRange.length}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg Payment</p>
              <p className="text-2xl font-bold text-navy mt-1">
                PKR {paymentsInRange.length > 0 ? Math.round(totalCollected / paymentsInRange.length).toLocaleString() : 0}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-navy text-sm">Collections by Method</h3>
              <button
                onClick={() => handleExport('payments')}
                disabled={downloading}
                className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Download size={13} /> Export
              </button>
            </div>
            {methodBreakdown.length === 0 ? (
              <EmptyState icon={Wallet} title="No approved payments in this period" />
            ) : (
              <div className="space-y-3">
                {methodBreakdown.map(([method, amount]) => (
                  <div key={method}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium capitalize">{method}</span>
                      <span className="text-navy font-semibold">PKR {amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-navy h-full rounded-full" style={{ width: `${(amount / maxMethod) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3 bg-gray-50/50">
            <div>
              <h3 className="font-semibold text-navy text-sm">Outstanding Balances</h3>
              <p className="text-xs text-gray-400 mt-0.5">Live ledger balance per customer — not tied to the date range above</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-red-600">Total: PKR {totalOutstanding.toLocaleString()}</span>
              <button
                onClick={() => handleExport('outstanding')}
                disabled={downloading}
                className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Download size={13} /> Export
              </button>
            </div>
          </div>
          {outstandingLoading ? (
            <SkeletonTable rows={5} cols={3} />
          ) : outstandingFiltered.length === 0 ? (
            <EmptyState icon={Receipt} title="No outstanding balances" subtitle="Every customer is settled up" />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {outPageRows.map((o, i) => (
                    <tr key={o.customer_id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{o.full_name}{o.shop_name ? ` — ${o.shop_name}` : ''}</td>
                      <td className="px-6 py-3.5 text-gray-500">{o.phone}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-red-600">PKR {Number(o.outstanding).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
                <span className="text-xs text-gray-400">
                  Showing {(outPage - 1) * OUT_PAGE_SIZE + 1} to {Math.min(outPage * OUT_PAGE_SIZE, outstandingFiltered.length)} of {outstandingFiltered.length} entries
                </span>
                <div className="flex gap-1.5">
                  <button onClick={() => setOutPage((p) => Math.max(1, p - 1))} disabled={outPage === 1} className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50">Prev</button>
                  <button onClick={() => setOutPage((p) => Math.min(outTotalPages, p + 1))} disabled={outPage === outTotalPages} className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
