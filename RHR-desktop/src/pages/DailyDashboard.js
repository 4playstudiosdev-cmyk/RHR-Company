import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, HandCoins, Landmark, Receipt, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Users } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonStatCards, SkeletonTable } from '../components/Skeleton';
import CityFilter from '../components/CityFilter';

const todayISO = () => new Date().toISOString().split('T')[0];

const fmt = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const num = (n) => Number(n || 0).toLocaleString();

// One-shot business overview — financial summary, P&L, order/production
// counts, salesman performance and low-stock alerts, all for one date
// range/branch — backed by GET /api/v1/daily-dashboard (see
// RHR-backend/src/routes/daily-dashboard.routes.js).
export default function DailyDashboard() {
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;

  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/daily-dashboard', {
        params: { from: dateFrom, to: dateTo, company_id: selectedCity }
      });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedCity]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const profit = Number(data?.financial?.daily_profit || 0);

  const statCards = [
    { label: 'Total Sales', value: fmt(data?.financial?.total_sales), icon: Wallet, bg: 'bg-navy-chip', color: 'text-navy' },
    { label: 'Total Recovery', value: fmt(data?.financial?.total_recovery), icon: HandCoins, bg: 'bg-green-100', color: 'text-green-700' },
    { label: 'Cash in Hand', value: fmt(data?.financial?.cash_in_hand), icon: Landmark, bg: 'bg-orange/10', color: 'text-orange' },
    { label: 'Total Expenses', value: fmt(data?.financial?.total_expenses), icon: Receipt, bg: 'bg-red-100', color: 'text-red-700' },
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Daily Management Dashboard"
        subtitle="Complete business overview at a glance"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayISO()}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
            />
            <Button variant="primary" onClick={loadDashboard} className="flex items-center gap-1.5">
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={5} cols={5} />
        </>
      ) : (
        <>
          {data?.low_stock_alerts?.has_alerts && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 mb-6">
              <h3 className="text-red-700 font-bold text-sm mb-2.5 flex items-center gap-1.5">
                <AlertTriangle size={15} /> Low Stock Alerts
              </h3>
              <div className="flex gap-2 flex-wrap">
                {data.low_stock_alerts.raw_materials.map((m) => (
                  <span key={m.id} className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                    {m.name}: {Number(m.stock).toLocaleString()} {m.unit}
                  </span>
                ))}
                {data.low_stock_alerts.products.map((p) => (
                  <span key={p.id} className="bg-orange text-white px-3 py-1 rounded-full text-xs font-semibold">
                    {p.name}: {Number(p.stock_quantity).toLocaleString()} {p.unit}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${card.bg} ${card.color}`}>
                  <card.icon size={22} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</p>
                  <p className={`text-xl font-bold leading-tight mt-0.5 ${card.color}`}>{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
            {/* P&L */}
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy mb-4 flex items-center gap-1.5">
                {profit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />} Profit &amp; Loss
              </h3>
              {[
                { label: 'Sales Revenue', value: fmt(data?.financial?.total_sales), color: 'text-green-700' },
                { label: 'Production Cost (COGS)', value: `- ${fmt(data?.financial?.total_production_cost)}`, color: 'text-red-700' },
                { label: 'Expenses', value: `- ${fmt(data?.financial?.total_expenses)}`, color: 'text-red-700' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center pb-2.5 mb-2.5 border-b border-gray-100">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm font-semibold text-navy">Daily Profit/Loss</span>
                <span className={`text-base font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(profit)}</span>
              </div>
            </div>

            {/* Orders */}
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy mb-4">Order Status</h3>
              {[
                { label: 'Total Orders', value: num(data?.orders?.total), color: 'text-navy' },
                { label: 'Delivered', value: num(data?.orders?.delivered), color: 'text-green-700' },
                { label: 'Pending', value: num(data?.orders?.pending), color: 'text-orange' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-2xl font-bold ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Production */}
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy mb-4">Production</h3>
              {[
                { label: 'Bags Produced', value: num(data?.production?.bags_produced), color: 'text-navy' },
                { label: 'Bags Dispatched', value: num(data?.production?.bags_dispatched), color: 'text-green-700' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center mb-4">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-2xl font-bold ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-navy flex items-center gap-1.5"><Users size={16} /> Salesman Performance</h3>
            </div>
            {!data?.salesman_performance?.length ? (
              <EmptyState icon={Users} title="No salesman data for this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy text-white">
                      {['Salesman', 'Orders', 'Sales Amount', 'Recovery', 'Outstanding'].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.salesman_performance.map((s, i) => (
                      <tr key={s.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">{s.name}</td>
                        <td className="px-6 py-3.5">{s.orders_count}</td>
                        <td className="px-6 py-3.5 font-semibold text-green-700">{fmt(s.sales)}</td>
                        <td className="px-6 py-3.5 font-semibold text-navy">{fmt(s.recovery)}</td>
                        <td className="px-6 py-3.5 font-semibold text-orange">{fmt(s.sales - s.recovery)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td className="px-6 py-3.5 text-white font-bold">TOTAL</td>
                      <td className="px-6 py-3.5 text-white font-bold">{data.orders.total}</td>
                      <td className="px-6 py-3.5 text-orange font-bold">{fmt(data.financial.total_sales)}</td>
                      <td className="px-6 py-3.5 text-orange font-bold">{fmt(data.financial.total_recovery)}</td>
                      <td className="px-6 py-3.5 text-orange font-bold">{fmt(data.financial.total_sales - data.financial.total_recovery)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
