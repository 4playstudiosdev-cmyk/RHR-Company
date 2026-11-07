import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, RefreshCw, Calendar } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import CityFilter from '../components/CityFilter';

const todayISO = () => new Date().toISOString().split('T')[0];
const fmtPKR = (n) => `Rs ${Number(n || 0).toLocaleString()}`;

function Section({ title, children }) {
  return (
    <div className="mb-5 bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
      <div className="bg-navy px-5 py-3">
        <h2 className="text-white font-bold text-sm uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

function NoData({ msg }) {
  return (
    <p className="px-5 py-6 text-sm text-gray-400 italic">{msg}</p>
  );
}

export default function MarketDifference({ setPage }) {
  const user = getCurrentUser();
  const [reportDate, setReportDate] = useState(todayISO);
  const [companyId, setCompanyId] = useState(user?.role === 'super_admin' ? '' : (user?.company_id || ''));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { date: reportDate };
      if (companyId) params.company_id = companyId;
      const res = await api.get('/daily-report', { params });
      if (res.data.success) setData(res.data.data);
      else setError(res.data.message || 'Failed to load');
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [reportDate, companyId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const s = data?.summary || {};
  const sales = data?.sales || [];
  const recovery = data?.recovery || [];

  const totalOrders = s.total_sales || 0;
  const totalRecovery = s.total_recovery || 0;
  const diff = totalRecovery - totalOrders;

  // Group recovery by salesman
  const recoveryBySalesman = {};
  recovery.forEach((r) => {
    if (!recoveryBySalesman[r.salesman]) {
      recoveryBySalesman[r.salesman] = { salesman: r.salesman, salesman_id: r.salesman_id, customers: 0, amount: 0 };
    }
    recoveryBySalesman[r.salesman].customers += 1;
    recoveryBySalesman[r.salesman].amount += Number(r.amount);
  });
  const recoveryRows = Object.values(recoveryBySalesman).sort((a, b) => b.amount - a.amount);

  return (
    <div className="p-6">
      <PageHeader
        title="Market Difference"
        subtitle="Today's delivered orders vs recovery collected"
        icon={TrendingUp}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {user?.role === 'super_admin' && (
              <CityFilter value={companyId} onChange={setCompanyId} />
            )}
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 bg-white">
              <Calendar size={14} className="text-navy" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => { if (e.target.value) setReportDate(e.target.value); }}
                className="text-sm text-navy bg-transparent outline-none"
              />
            </div>
            <Button variant="secondary" onClick={loadReport} className="flex items-center gap-1.5">
              <RefreshCw size={14} /> Load
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-navy" />
        </div>
      ) : !data ? null : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card px-5 py-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Total Orders (Delivered)</p>
              <p className="text-2xl font-bold text-navy">{fmtPKR(totalOrders)}</p>
              <p className="text-xs text-gray-400 mt-1">{sales.length} order{sales.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card px-5 py-4">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Total Recovery</p>
              <p className="text-2xl font-bold text-green-700">{fmtPKR(totalRecovery)}</p>
              <p className="text-xs text-gray-400 mt-1">{recovery.length} payment{recovery.length !== 1 ? 's' : ''}</p>
            </div>
            <div className={`rounded-2xl border shadow-card px-5 py-4 ${diff >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Market Difference</p>
              <p className={`text-2xl font-bold ${diff >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {diff >= 0 ? '+' : ''}{fmtPKR(diff)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {diff >= 0 ? 'Recovery exceeds orders' : 'Orders exceed recovery'}
              </p>
            </div>
          </div>

          {/* ── Delivered Orders ── */}
          <Section title={`Delivered Orders — ${reportDate}`}>
            {sales.length === 0 ? <NoData msg="No delivered orders for this date." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['SNo', 'Order #', 'Customer', 'Products', 'Amount'].map(h => (
                        <th key={h} className={`px-4 py-2.5 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.sno} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400">{s.sno}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-navy">{s.order_number}</td>
                        <td className="px-4 py-2.5 font-medium">{s.customer}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{s.products}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-navy">{fmtPKR(s.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={4} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtPKR(totalOrders)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── Recovery ── */}
          <Section title={`Recovery — ${reportDate}`}>
            {recoveryRows.length === 0 ? <NoData msg="No recovery for this date." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['SNo', 'Salesman', 'Customers', 'Total Recovery'].map(h => (
                        <th key={h} className={`px-4 py-2.5 ${h === 'Total Recovery' ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryRows.map((r, i) => (
                      <tr key={r.salesman} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-navy">{r.salesman}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.customers} customer{r.customers !== 1 ? 's' : ''}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmtPKR(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={3} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtPKR(totalRecovery)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── Market Difference Summary ── */}
          <div className={`rounded-2xl border p-5 ${diff >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h3 className={`font-bold text-sm uppercase tracking-wide mb-3 ${diff >= 0 ? 'text-green-800' : 'text-red-700'}`}>
              Market Difference Summary
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Total Delivered Orders', value: fmtPKR(totalOrders), color: 'text-navy' },
                { label: 'Total Recovery Collected', value: fmtPKR(totalRecovery), color: 'text-green-700' },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-sm font-semibold ${row.color}`}>{row.value}</span>
                </div>
              ))}
              <div className="border-t border-gray-300 pt-2 flex justify-between items-center">
                <span className={`text-sm font-bold ${diff >= 0 ? 'text-green-800' : 'text-red-700'}`}>Market Difference</span>
                <span className={`text-lg font-bold ${diff >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{fmtPKR(diff)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
