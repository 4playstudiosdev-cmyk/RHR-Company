import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Plus, FileText, FileSpreadsheet, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { exportTableToExcel } from './production/exportUtils';

const EMPTY_ADJUSTMENT = { entry_type: 'debit', amount: '', description: '' };
const PAGE_SIZE = 8;

// Some ledger entries carry a reference_type (order/payment/adjustment) set
// by the DB trigger that posts them; manual adjustments always have it.
// Falls back to entry_type so every row still gets a sensible badge.
function typeLabel(entry) {
  return (entry.reference_type || entry.entry_type || '').replace(/^\w/, (c) => c.toUpperCase());
}

function typeBadgeClasses(entry) {
  const t = (entry.reference_type || entry.entry_type || '').toLowerCase();
  if (t === 'payment' || t === 'credit') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (t === 'order' || t === 'debit') return 'bg-red-50 text-red-600 border border-red-100';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

export default function Ledger({ initialCustomerId }) {
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');

  const [entries, setEntries] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

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
      setPage(1);
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

  const totalDebit = entries.filter((e) => e.entry_type === 'debit').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredit = entries.filter((e) => e.entry_type === 'credit').reduce((sum, e) => sum + Number(e.amount), 0);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  const handleExportExcel = () => {
    const head = ['Date', 'Description', 'Debit (DR)', 'Credit (CR)', 'Balance', 'Type'];
    const rows = entries.map((e) => [
      new Date(e.created_at).toLocaleDateString('en-GB'),
      e.description || '',
      e.entry_type === 'debit' ? Number(e.amount) : '',
      e.entry_type === 'credit' ? Number(e.amount) : '',
      Number(e.running_balance),
      typeLabel(e)
    ]);
    exportTableToExcel({
      sheetName: 'Ledger',
      head,
      rows,
      filename: `ledger-${(selectedCustomer?.full_name || customerId).replace(/\s+/g, '-')}`
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customer Ledger</h1>
          <p className="text-sm text-gray-500 mt-1">View financial history and outstanding balances.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadStatement}
            disabled={!customerId || downloading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-navy text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText size={16} /> {downloading ? 'Downloading…' : 'Export PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!customerId || entries.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-navy text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <Button
            variant="accent"
            onClick={() => setShowModal(true)}
            disabled={!customerId}
            className="flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus size={16} /> Add Adjustment
          </Button>
        </div>
      </div>

      {/* Customer / date selector */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="min-w-[240px] flex-1 md:flex-none">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Select Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            disabled={customersLoading}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow bg-white"
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
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Start Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">End Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!customerId ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100">
          <EmptyState icon={BookOpen} title="Select a customer" subtitle="Choose a customer above to view their ledger" />
        </div>
      ) : loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-[110px] animate-pulse" />
            ))}
          </div>
          <SkeletonTable rows={6} cols={6} />
        </>
      ) : (
        <>
          {/* Balance summary */}
          {entries.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
              <div className="bg-white rounded-2xl shadow-card border border-red-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-red-50 flex items-center justify-center text-red-600">
                    <TrendingDown size={18} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-500">Total Debit (Billed)</h3>
                </div>
                <div className="text-[26px] leading-tight font-bold text-red-600">
                  PKR {totalDebit.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-emerald-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <TrendingUp size={18} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-500">Total Credit (Paid)</h3>
                </div>
                <div className="text-[26px] leading-tight font-bold text-emerald-600">
                  PKR {totalCredit.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-orange/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-orange/10 flex items-center justify-center text-orange">
                    <Wallet size={18} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-500">Outstanding Balance</h3>
                </div>
                <div className="text-[26px] leading-tight font-bold text-orange">
                  PKR {Number(currentBalance).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-navy">Transaction History</h2>
            </div>

            {entries.length === 0 ? (
              <EmptyState icon={BookOpen} title="No ledger entries" subtitle="Entries will appear here as orders, payments and adjustments occur" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Debit (DR)</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Credit (CR)</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-center">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((entry, i) => (
                        <tr
                          key={entry.id}
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3.5 whitespace-nowrap text-gray-500">
                            {new Date(entry.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-6 py-3.5 text-navy font-medium">{entry.description || '—'}</td>
                          <td className="px-6 py-3.5 text-right text-red-600 font-medium">
                            {entry.entry_type === 'debit' ? `PKR ${Number(entry.amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-6 py-3.5 text-right text-emerald-600 font-medium">
                            {entry.entry_type === 'credit' ? `PKR ${Number(entry.amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-6 py-3.5 text-right font-semibold text-navy">
                            PKR {Number(entry.running_balance).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${typeBadgeClasses(entry)}`}>
                              {typeLabel(entry)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
                  <span className="text-xs text-gray-400">
                    Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, entries.length)} of {entries.length} entries
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
                          page === i + 1
                            ? 'bg-navy text-white border-navy'
                            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
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
        </>
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
