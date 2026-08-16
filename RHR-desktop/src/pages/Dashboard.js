import React, { useEffect, useState } from 'react';
import {
  ShoppingCart, Wallet, HourglassIcon, ReceiptText, Bell, CalendarDays,
  ArrowRight, Inbox
} from 'lucide-react';
import api from '../services/api';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonStatCards, SkeletonTable } from '../components/Skeleton';

const TODAY_LABEL = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

// Order statuses shown as a breakdown of the live order book (progress
// bars), in display order — mirrors the set actually produced by the
// orders API (see RHR-backend/src/controllers/orders.controller.js).
const STATUS_BREAKDOWN = [
  { key: 'pending', label: 'Pending', bar: 'bg-orange' },
  { key: 'preparing', label: 'Preparing', bar: 'bg-navy-container' },
  { key: 'dispatched', label: 'Dispatched', bar: 'bg-navy' },
  { key: 'delivered', label: 'Delivered', bar: 'bg-emerald-500' }
];

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Builds the last-7-days revenue series (oldest -> today) from the live
// order list, so the chart reflects real orders instead of demo numbers.
function buildWeekSeries(orders) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: d.toDateString(), label: DAY_LABEL[d.getDay()], total: 0, isToday: i === 0 });
  }
  orders.forEach((o) => {
    const key = new Date(o.created_at).toDateString();
    const day = days.find((d) => d.key === key);
    if (day) day.total += Number(o.total_amount) || 0;
  });
  const max = Math.max(...days.map((d) => d.total), 1);
  return days.map((d) => ({ ...d, pct: Math.max((d.total / max) * 100, d.total > 0 ? 6 : 2) }));
}

export default function Dashboard({ user, setPage }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ ordersToday: 0, pendingOrders: 0 });
  const [financials, setFinancials] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [weekSeries, setWeekSeries] = useState([]);
  const [pendingCustomers, setPendingCustomers] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, pendingCustomersRes, paymentsRes] = await Promise.all([
        api.get('/orders'),
        api.get('/customers/pending'),
        api.get('/payments')
      ]);

      // Non-fatal — company-wide financial totals are a bonus on top of the
      // core stats above, so a failure here shouldn't block the dashboard.
      api.get('/analytics/dashboard')
        .then((res) => setFinancials(res.data.data))
        .catch(() => setFinancials(null));

      const orders = ordersRes.data.data || [];
      const today = new Date().toDateString();
      const ordersToday = orders.filter((o) => new Date(o.created_at).toDateString() === today).length;
      const pendingOrders = orders.filter((o) => o.status === 'pending').length;

      const counts = {};
      orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });

      setStats({ ordersToday, pendingOrders });
      setStatusCounts(counts);
      setWeekSeries(buildWeekSeries(orders));
      setRecentOrders(orders.slice(0, 10));
      setPendingCustomers(pendingCustomersRes.data.data || []);
      setPendingPayments((paymentsRes.data.data || []).filter((p) => p.status === 'pending'));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const totalOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0) || 1;
  const actionItems = [
    ...pendingCustomers.slice(0, 3).map((c) => ({
      id: `cust-${c.id}`,
      text: `Approve signup — ${c.full_name || c.email || 'New customer'}`,
      when: 'Pending approval',
      dot: 'bg-orange',
      onClick: () => setPage?.('customers')
    })),
    ...pendingPayments.slice(0, 3).map((p) => ({
      id: `pay-${p.id}`,
      text: `Confirm payment — PKR ${Number(p.amount).toLocaleString()}`,
      when: 'Awaiting confirmation',
      dot: 'bg-navy-container',
      onClick: () => setPage?.('payments')
    }))
  ].slice(0, 5);

  return (
    <div className="p-6 lg:p-8 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {greeting()}{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''} 👋
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage?.('notifications')}
            title="Notifications"
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-navy hover:bg-navy-chip/40 transition-colors"
          >
            <Bell size={19} strokeWidth={2} />
          </button>
          <button
            title={TODAY_LABEL}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-navy hover:bg-navy-chip/40 transition-colors"
          >
            <CalendarDays size={19} strokeWidth={2} />
          </button>
          <div className="w-9 h-9 rounded-full bg-navy-chip text-navy flex items-center justify-center text-sm font-bold ml-1">
            {getInitials(user?.fullName)}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={5} cols={5} />
        </>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <StatCard label="Orders Today" value={stats.ordersToday} icon={ShoppingCart} color="navy" />
            <StatCard
              label="Revenue"
              value={financials ? `PKR ${Number(financials.totalRevenue).toLocaleString()}` : '—'}
              icon={Wallet}
              color="navy"
            />
            <StatCard label="Pending Orders" value={stats.pendingOrders} icon={HourglassIcon} color="orange" />
            <StatCard
              label="Outstanding"
              value={financials ? `PKR ${Number(financials.outstanding).toLocaleString()}` : '—'}
              icon={ReceiptText}
              color="orange"
            />
          </div>

          {/* Middle row: recent orders + side stack */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="font-semibold text-navy">Recent Orders</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Last 10 orders placed</p>
                </div>
                <button
                  onClick={() => setPage?.('orders')}
                  className="text-navy text-sm font-medium hover:underline flex items-center gap-1"
                >
                  View All <ArrowRight size={15} />
                </button>
              </div>

              {recentOrders.length === 0 ? (
                <EmptyState icon={Inbox} title="No orders yet" subtitle="New orders will show up here" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Total</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order, i) => (
                        <tr
                          key={order.id}
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3.5 font-medium text-navy">{order.order_number}</td>
                          <td className="px-6 py-3.5">{order.users?.full_name || '—'}</td>
                          <td className="px-6 py-3.5 font-medium">PKR {Number(order.total_amount).toLocaleString()}</td>
                          <td className="px-6 py-3.5">
                            <StatusBadge status={order.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="lg:col-span-4 flex flex-col gap-5">
              {/* Order status breakdown (replaces a "branch targets" mock with real data) */}
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
                <h3 className="font-semibold text-navy mb-4">Order Status</h3>
                <div className="space-y-4">
                  {STATUS_BREAKDOWN.map((s) => {
                    const count = statusCounts[s.key] || 0;
                    const pct = Math.round((count / totalOrders) * 100);
                    return (
                      <div key={s.key}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">{s.label}</span>
                          <span className="text-navy font-medium">{count}</span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div className={`${s.bar} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Requires action — real pending approvals/payments */}
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex-1">
                <h3 className="font-semibold text-navy mb-3">Requires Action</h3>
                {actionItems.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Nothing needs your attention 🎉</p>
                ) : (
                  <ul className="space-y-1">
                    {actionItems.map((item) => (
                      <li
                        key={item.id}
                        onClick={item.onClick}
                        className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-100"
                      >
                        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.dot}`} />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 leading-tight truncate">{item.text}</p>
                          <span className="text-[11px] text-gray-400">{item.when}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Sales overview — real last-7-days revenue */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-6 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-semibold text-navy">Sales Overview</h3>
                <p className="text-sm text-gray-400">PKR vs Date — Last 7 Days</p>
              </div>
            </div>
            <div className="flex-1 flex items-end justify-around gap-3 px-1">
              {weekSeries.map((d) => (
                <div key={d.key} className="flex flex-col items-center gap-2 group flex-1 h-full justify-end">
                  <div className="relative w-full flex justify-center h-full items-end">
                    <div
                      className={`w-full max-w-[40px] rounded-t-md transition-all relative ${
                        d.isToday ? 'bg-navy shadow-[0_0_10px_rgba(7,60,159,0.4)]' : 'bg-navy-chip group-hover:bg-navy-container'
                      }`}
                      style={{ height: `${d.pct}%` }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        PKR {d.total.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs ${d.isToday ? 'text-navy font-bold' : 'text-gray-400'}`}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
