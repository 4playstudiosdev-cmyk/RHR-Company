import React, { useEffect, useState } from 'react';
import { Users, UserCheck, BookOpen } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

export default function Customers({ onViewLedger }) {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      const [pendingRes, allRes] = await Promise.all([
        api.get('/customers/pending'),
        api.get('/customers')
      ]);
      setPending(pendingRes.data.data || []);
      setAll(allRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (customer) => {
    if (!window.confirm(`Approve "${customer.full_name}"?`)) return;
    setApprovingId(customer.id);
    try {
      await api.patch(`/auth/approve-customer/${customer.id}`);
      setPending((prev) => prev.filter((c) => c.id !== customer.id));
      toast.success(`${customer.full_name} approved.`);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve customer.');
    } finally {
      setApprovingId(null);
    }
  };

  const tabs = [
    { key: 'pending', label: 'Pending Approval', count: pending.length },
    { key: 'all', label: 'All Customers', count: all.length }
  ];

  return (
    <div className="p-6">
      <PageHeader title="Customers" subtitle="Approve new signups and browse your customer base" />

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {tab === 'pending' ? (
            pending.length === 0 ? (
              <EmptyState icon={UserCheck} title="No customers awaiting approval" subtitle="New signups will show up here" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Registered</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((customer, i) => (
                    <tr
                      key={customer.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{customer.full_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{customer.phone}</td>
                      <td className="px-6 py-3.5 text-gray-500">
                        {new Date(customer.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-3.5">
                        <Button
                          variant="accent"
                          className="text-xs px-3 py-1.5"
                          onClick={() => handleApprove(customer)}
                          disabled={approvingId === customer.id}
                        >
                          {approvingId === customer.id ? 'Approving...' : 'Approve'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : all.length === 0 ? (
            <EmptyState icon={Users} title="No customers found" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Email</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {all.map((customer, i) => (
                  <tr
                    key={customer.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-medium text-navy">{customer.full_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{customer.phone}</td>
                    <td className="px-6 py-3.5 text-gray-600">{customer.email || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          customer.is_approved
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {customer.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {onViewLedger && (
                        <button
                          onClick={() => onViewLedger(customer.id)}
                          className="flex items-center gap-1.5 text-xs text-navy hover:underline"
                        >
                          <BookOpen size={13} /> View Ledger
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
