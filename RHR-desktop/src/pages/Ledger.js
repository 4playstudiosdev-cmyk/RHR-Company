import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Plus, Download } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_ADJUSTMENT = { entry_type: 'debit', amount: '', description: '' };

export default function Ledger({ initialCustomerId }) {
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');

  const [entries, setEntries] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_ADJUSTMENT);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      const res = await api.get('/customers');
      setCustomers(res.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load customer list.');
    } finally {
      setCustomersLoading(false);
    }
  };

  const loadLedger = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const res = await api.get(`/ledger/${customerId}`, { params });
      setEntries(res.data.data.entries || []);
      setCurrentBalance(res.data.data.currentBalance || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load ledger.');
    } finally {
      setLoading(false);
    }
  }, [customerId, fromDate, toDate]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.description) {
      toast.error('Amount and description are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/ledger/adjustment', {
        customer_id: customerId,
        entry_type: form.entry_type,
        amount: Number(form.amount),
        description: form.description
      });
      toast.success('Ledger entry added.');
      setShowModal(false);
      setForm(EMPTY_ADJUSTMENT);
      loadLedger();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add ledger entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadStatement = async () => {
    setDownloading(true);
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const res = await api.get(`/ledger/${customerId}/statement`, {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `statement-${customerId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Statement downloaded.');
    } catch (err) {
      toast.error('Failed to download statement.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Ledger"
        subtitle="View customer account activity and post manual adjustments"
        action={
          customerId && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleDownloadStatement}
                disabled={downloading}
                className="flex items-center gap-2"
              >
                <Download size={16} /> {downloading ? 'Downloading...' : 'Statement PDF'}
              </Button>
              <Button
                variant="accent"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2"
              >
                <Plus size={16} /> Add Adjustment
              </Button>
            </div>
          )
        }
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={customersLoading}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
          >
            <option value="">— Select a customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} ({c.phone})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
          />
        </div>
        {customerId && (
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Current Balance</p>
            <p className={`text-xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              PKR {Number(currentBalance).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!customerId ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState icon={BookOpen} title="Select a customer" subtitle="Choose a customer above to view their ledger" />
        </div>
      ) : loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {entries.length === 0 ? (
            <EmptyState icon={BookOpen} title="No ledger entries" subtitle="Entries will appear here as orders, payments and adjustments occur" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 text-gray-500">
                      {new Date(entry.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-3.5 text-navy font-medium">{entry.description || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                          entry.entry_type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-gray-600">
                      PKR {Number(entry.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-navy">
                      PKR {Number(entry.running_balance).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={`Add Ledger Adjustment${selectedCustomer ? ` — ${selectedCustomer.full_name}` : ''}`} onClose={() => setShowModal(false)}>
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Entry Type *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entry_type"
                    checked={form.entry_type === 'debit'}
                    onChange={() => setForm({ ...form, entry_type: 'debit' })}
                  />
                  Debit (customer owes more)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entry_type"
                    checked={form.entry_type === 'credit'}
                    onChange={() => setForm({ ...form, entry_type: 'credit' })}
                  />
                  Credit (reduces balance)
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (PKR) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Opening balance, discount, correction..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? 'Saving...' : 'Add Entry'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
