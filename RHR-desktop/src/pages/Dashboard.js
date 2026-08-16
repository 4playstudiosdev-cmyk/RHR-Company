import React, { useEffect, useState } from 'react';
import { ClipboardList, UserCheck, Boxes, CreditCard, Inbox, TrendingUp, Wallet, AlertCircle } from 'lucide-react';
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

export default function Dashboard({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    ordersToday: 0,
    pendingCustomers: 0,
    totalProducts: 0,
    pendingPayments: 0
  });
  const [financials, setFinancials] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, pendingCustomersRes, productsRes, paymentsRes] = await Promise.all([
        api.get('/orders'),
        api.get('/customers/pending'),
        api.get('/products', { params: { limit: 1 } }),
        api.get('/payments')
      ]);

      // Non-fatal — company-wide financial totals are a bonus on top of the
      // core stats above, so a failure here shouldn't block the dashboard.
      api.get('/analytics/dashboard')
        .then((res) => setFinancials(res.data.data))
        .catch(() => setFinancials(null));

      const orders = ordersRes.data.data || [];
      const today = new Date().toDateString();
      const ordersToday = orders.filter(
        (o) => new Date(o.created_at).toDateString() === today
      ).length;

      const payments = paymentsRes.data.data || [];
      const pendingPayments = payments.filter((p) => p.status === 'pending').length;

      setStats({
        ordersToday,
        pendingCustomers: (pendingCustomersRes.data.data || []).length,
        totalProducts: productsRes.data.data?.total ?? 0,
        pendingPayments
      });

      setRecentOrders(orders.slice(0, 10));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">
          Welcome back{user?.fullName ? `, ${user.fullName}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{TODAY_LABEL}</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard label="Orders Today" value={stats.ordersToday} icon={ClipboardList} color="navy" />
            <StatCard label="Pending Approvals" value={stats.pendingCustomers} icon={UserCheck} color="orange" />
            <StatCard label="Total Products" value={stats.totalProducts} icon={Boxes} color="navy" />
            <StatCard label="Pending Payments" value={stats.pendingPayments} icon={CreditCard} color="orange" />
          </div>

          {financials && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <StatCard
                label="Total Revenue"
                value={`PKR ${Number(financials.totalRevenue).toLocaleString()}`}
                icon={TrendingUp}
                color="navy"
              />
              <StatCard
                label="Total Collected"
                value={`PKR ${Number(financials.totalCollected).toLocaleString()}`}
                icon={Wallet}
                color="navy"
              />
              <StatCard
                label="Outstanding"
                value={`PKR ${Number(financials.outstanding).toLocaleString()}`}
                icon={AlertCircle}
                color="orange"
              />
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-navy">Recent Orders</h2>
              <p className="text-xs text-gray-400 mt-0.5">Last 10 orders placed</p>
            </div>

            {recentOrders.length === 0 ? (
              <EmptyState icon={Inbox} title="No orders yet" subtitle="New orders will show up here" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Total</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
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
                      <td className="px-6 py-3.5">PKR {Number(order.total_amount).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-3.5 text-gray-500">
                        {new Date(order.created_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
