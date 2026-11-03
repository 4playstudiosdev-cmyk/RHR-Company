import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import CityFilter from '../components/CityFilter';
import { SkeletonStatCards, SkeletonTable } from '../components/Skeleton';

const fmtPKR = (n) => `Rs ${Number(n || 0).toLocaleString()}`;

function StatCard({ label, value, sub, color = 'text-navy', bg = 'bg-navy-chip' }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle size={11} /> Approved
    </span>
  );
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange/10 text-orange">
      <Clock size={11} /> Pending
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <AlertCircle size={11} /> {status}
    </span>
  );
}

export default function CashClosing() {
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;

  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/recovery/cash-summary', {
        params: { company_id: selectedCity },
      });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load cash closing data.');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => { loadData(); }, [loadData]);

  const t = data?.totals || {};

  return (
    <div className="p-6">
      <PageHeader
        title="Cash Closing"
        subtitle="Salesman cash collections, deposits, and cash in hand"
        icon={Landmark}
        action={
          <div className="flex items-center gap-2">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            <Button variant="secondary" onClick={loadData} className="flex items-center gap-1.5">
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={5} cols={5} />
        </>
      ) : !data ? null : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Total Cash Collected"
              value={fmtPKR(t.total_collected)}
              sub="All approved cash recoveries"
              color="text-navy"
            />
            <StatCard
              label="Total Deposited"
              value={fmtPKR(t.total_deposited)}
              sub="Approved closings"
              color="text-green-700"
              bg="bg-green-50"
            />
            <StatCard
              label="Pending Deposit"
              value={fmtPKR(t.pending_deposit)}
              sub="Awaiting admin approval"
              color="text-orange"
            />
            <StatCard
              label="Total Cash In Hand"
              value={fmtPKR(t.cash_in_hand)}
              sub="Still with salesmen"
              color={t.cash_in_hand > 0 ? 'text-red-600' : 'text-green-700'}
            />
          </div>

          {/* ── Per-salesman breakdown ── */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mb-5">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-navy text-sm">Salesman-wise Cash Position</h3>
            </div>
            {!data.per_salesman?.length ? (
              <EmptyState icon={Landmark} title="No cash data available" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy text-white">
                      {['Salesman', 'Total Collected', 'Total Deposited', 'Pending Deposit', 'Cash In Hand'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_salesman.map((s, i) => (
                      <tr key={s.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3.5 font-semibold text-navy">{s.name}</td>
                        <td className="px-5 py-3.5 font-medium">{fmtPKR(s.total_collected)}</td>
                        <td className="px-5 py-3.5 text-green-700 font-medium">{fmtPKR(s.total_deposited)}</td>
                        <td className="px-5 py-3.5">
                          {s.pending_deposit > 0 ? (
                            <span className="text-orange font-semibold">{fmtPKR(s.pending_deposit)}</span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`font-bold ${s.cash_in_hand > 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {fmtPKR(s.cash_in_hand)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td className="px-5 py-3.5 text-white font-bold text-xs">TOTAL</td>
                      <td className="px-5 py-3.5 text-white font-bold">{fmtPKR(t.total_collected)}</td>
                      <td className="px-5 py-3.5 text-orange font-bold">{fmtPKR(t.total_deposited)}</td>
                      <td className="px-5 py-3.5 text-orange font-bold">{fmtPKR(t.pending_deposit)}</td>
                      <td className="px-5 py-3.5 text-orange font-bold">{fmtPKR(t.cash_in_hand)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── All closings history ── */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-semibold text-navy text-sm">Cash Closing History</h3>
            </div>
            {!data.recent_closings?.length ? (
              <EmptyState icon={Landmark} title="No closings submitted yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy text-white">
                      {['Date', 'Salesman', 'Amount', 'Deposit To', 'Bank / Notes', 'Status'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_closings.map((c, i) => (
                      <tr key={c.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 text-gray-600">{c.closing_date}</td>
                        <td className="px-5 py-3 font-semibold text-navy">{c.salesman_name}</td>
                        <td className="px-5 py-3 font-semibold">{fmtPKR(c.amount)}</td>
                        <td className="px-5 py-3 capitalize text-gray-600">
                          {c.deposit_to === 'petty_cash' ? 'Petty Cash' : 'Bank'}
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {c.bank_account || c.notes || '—'}
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                      </tr>
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
