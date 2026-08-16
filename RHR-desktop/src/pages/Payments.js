import React, { useEffect, useState } from 'react';
import { Wallet, ImageOff, ExternalLink } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonCards } from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Payments() {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);

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

  return (
    <div className="p-6">
      <PageHeader title="Payments" subtitle="Review payment proofs submitted by salesmen" />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState icon={Wallet} title="No payments found" subtitle="Submitted payment proofs will appear here" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden"
            >
              <div className="bg-gray-100 h-40 flex items-center justify-center overflow-hidden">
                {payment.photo_url ? (
                  <img
                    src={payment.photo_url}
                    alt="Payment proof"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="flex-col items-center justify-center text-gray-400 gap-1.5"
                  style={{ display: payment.photo_url ? 'none' : 'flex' }}
                >
                  <ImageOff size={22} />
                  <span className="text-xs">No photo proof</span>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-navy">
                    PKR {Number(payment.amount).toLocaleString()}
                  </p>
                  <StatusBadge status={payment.status} />
                </div>
                <p className="text-sm text-gray-700">{payment.customer?.full_name || '—'}</p>
                <p className="text-xs text-gray-400 mb-1">{payment.customer?.phone || ''}</p>
                <p className="text-xs text-gray-400">
                  Method: {payment.method} &middot;{' '}
                  {new Date(payment.created_at).toLocaleDateString('en-GB')}
                </p>
                {payment.salesman?.full_name && (
                  <p className="text-xs text-gray-400">
                    Collected by: {payment.salesman.full_name}
                  </p>
                )}

                {payment.photo_url && (
                  <a
                    href={payment.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-navy hover:underline mt-2"
                  >
                    <ExternalLink size={12} /> Open photo in new tab
                  </a>
                )}

                {payment.status === 'pending' && (
                  <div className="flex gap-2 mt-4">
                    <Button
                      className="flex-1 text-xs justify-center"
                      onClick={() => handleReview(payment, 'approved')}
                      disabled={reviewingId === payment.id}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1 text-xs justify-center"
                      onClick={() => handleReview(payment, 'rejected')}
                      disabled={reviewingId === payment.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
