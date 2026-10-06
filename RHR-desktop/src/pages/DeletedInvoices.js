import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';

export default function DeletedInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDeletedInvoices();
  }, []);

  const loadDeletedInvoices = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/orders/deleted-invoices');
      setInvoices(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load deleted invoices.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Deleted Invoices"
        subtitle="Audit record of every invoice a super admin has deleted"
      />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {invoices.length === 0 ? (
            <EmptyState icon={Trash2} title="No deleted invoices" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Deleted At</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Deleted By</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <tr key={inv.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{inv.order_number || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600">{inv.customer_name || '—'}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-red-600">
                        PKR {Number(inv.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-gray-500">{new Date(inv.deleted_at).toLocaleString()}</td>
                      <td className="px-6 py-3.5 text-gray-600">{inv.deleted_by_user?.full_name || '—'}</td>
                      <td className={`px-6 py-3.5 text-gray-500 ${!inv.reason ? 'italic' : ''}`}>
                        {inv.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
