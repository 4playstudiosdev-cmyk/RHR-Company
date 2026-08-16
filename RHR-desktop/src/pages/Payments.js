import React, { useEffect, useMemo, useState } from 'react';
import { Wallet, ImageOff, ExternalLink } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const TABS = ['all', 'pending', 'approved', 'rejected'];
const PAGE_SIZE = 10;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export default function Payments() {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/payments');
      setPayments(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (payment, status) => {
    if (!window.confirm(`Mark this payment as ${status}?`)) return;
    setReviewingId(payment.id);
    try {
      await api.patch(`/payments/${payment.id}/review`, { status });
      setPayments((prev) =>
        prev.map((p) => (p.id === payment.id ? { ...p, status } : p))
      );
      toast.success(`Payment ${status}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update payment.');
    } finally {
      setReviewingId(null);
    }
  };

  const counts = useMemo(() => ({
    all: payments.length,
    pending: payments.filter((p) => p.status === 'pending').length,
    approved: payments.filter((p) => p.status === 'approved').length,
    rejected: payments.filter((p) => p.status === 'rejected').length
  }), [payments]);

  const filtered = tab === 'all' ? payments : payments.filter((p) => p.status === tab);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagePayments = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Payments</h1>
        <p className="text-sm text-gray-500 mt-1">Review and approve salesman collections.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {/* Status tabs */}
        <div className="flex items-center gap-5 px-6 border-b border-gray-100 pt-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`pb-3 pt-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t ? 'text-navy border-navy' : 'text-gray-400 border-transparent hover:text-navy'
              }`}
            >
              <span className="capitalize">{t}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                tab === t ? 'bg-navy-chip text-navy' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments here" subtitle="Submitted payment proofs will appear here" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Method</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Proof</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagePayments.map((payment, i) => (
                    <tr
                      key={payment.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-navy-chip text-navy flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                            {getInitials(payment.salesman?.full_name)}
                          </div>
                          <span className="font-medium text-navy">{payment.salesman?.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">{payment.customer?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 font-semibold text-navy">
                        PKR {Number(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-md bg-navy-chip/60 text-navy text-xs font-medium capitalize">
                          {payment.method}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">
                        {new Date(payment.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-3.5">
                        {payment.photo_url ? (
                          <a
                            href={payment.photo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-navy hover:underline font-medium"
                          >
                            <ExternalLink size={12} /> View Photo
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <ImageOff size={12} /> No Photo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={payment.status} />
                      </td>
                      <td className="px-6 py-3.5">
                        {payment.status === 'pending' ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleReview(payment, 'approved')}
                              disabled={reviewingId === payment.id}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReview(payment, 'rejected')}
                              disabled={reviewingId === payment.id}
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Processed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
              <span className="text-xs text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`px-3 py-1.5 rounded-md text-sm border ${
                      page === i + 1 ? 'bg-navy text-white border-navy' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
