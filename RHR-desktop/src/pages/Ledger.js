import React, { useEffect, useState, useCallback } from 'react';
import { BookOpen, Plus, FileText, FileSpreadsheet, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { exportTableToExcel } from './production/exportUtils';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const EMPTY_ADJUSTMENT = { entry_type: 'debit', amount: '', description: '' };
const PAGE_SIZE = 8;

// Some ledger entries carry a reference_type (order/payment/adjustment) set
// by the DB trigger that posts them; manual adjustments don't, so this
// falls back to entry_type — shown as "Billed"/"Received" (never the raw
// Debit/Credit wording) so every row still gets a plain-language badge.
function typeLabel(entry) {
  if (entry.reference_type) return entry.reference_type.replace(/^\w/, (c) => c.toUpperCase());
  return entry.entry_type === 'debit' ? 'Billed' : 'Received';
}

function typeBadgeClasses(entry) {
  const t = (entry.reference_type || entry.entry_type || '').toLowerCase();
  if (t === 'payment' || t === 'credit' || t === 'recovery') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (t === 'order' || t === 'debit') return 'bg-blue-50 text-blue-600 border border-blue-100';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

// Pulls a human order number like "KHI-2026-00008" out of a ledger
// description — both "Order KHI-2026-00015 confirmed" and
// "Return — Order #KHI-2026-00001" carry it in plain text already, so
// this needs no new backend field to make it clickable.
const ORDER_NUMBER_RE = /([A-Z]{2,5}-\d{4}-\d+)/;

function extractOrderNumber(description) {
  const match = (description || '').match(ORDER_NUMBER_RE);
  return match ? match[1] : null;
}

// Splits a description around its order number (if any) so the order
// number alone can render as a clickable link, with the rest of the
// text staying plain.
function DescriptionCell({ description, onViewOrderNumber }) {
  const orderNumber = extractOrderNumber(description);
  if (!orderNumber || !onViewOrderNumber) return <>{description || '—'}</>;

  const idx = description.indexOf(orderNumber);
  const before = description.slice(0, idx);
  const after = description.slice(idx + orderNumber.length);
  return (
    <>
      {before}
      <button
        type="button"
        onClick={() => onViewOrderNumber(orderNumber)}
        className="text-blue-600 underline underline-offset-2 hover:text-blue-800 font-semibold"
      >
        {orderNumber}
      </button>
      {after}
    </>
  );
}

// "Cash payment received by salesman" / similar generic trigger text
// doesn't name who actually collected it — this best-effort matches the
// entry to a payment record for the same customer (closest amount +
// nearest timestamp) and appends the real salesman's name, without
// touching the DB trigger that writes the original description.
function enrichRecoveryDescription(entry, payments) {
  if (entry.reference_type !== 'recovery' || !payments?.length) return entry.description;
  if (/by\s+\S/.test(entry.description || '')) return entry.description; // already names someone

  const entryTime = new Date(entry.created_at).getTime();
  let best = null;
  let bestDiff = Infinity;
  for (const p of payments) {
    if (Number(p.amount) !== Number(entry.amount)) continue;
    if (p.status !== 'approved') continue;
    const diff = Math.abs(new Date(p.created_at).getTime() - entryTime);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  // Only trust a match within a generous 48h window of the ledger entry
  // itself — anything further apart is more likely a coincidental
  // same-amount payment than the one that actually produced this entry.
  if (!best || bestDiff > 48 * 60 * 60 * 1000 || !best.salesman?.full_name) return entry.description;
  return `${entry.description} by ${best.salesman.full_name} (Salesman)`;
}

export default function Ledger({ initialCustomerId, onViewOrderNumber }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId] = useState(initialCustomerId || '');

  const [entries, setEntries] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
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
  }, [selectedCity]);

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const data = companyFilter
        ? (await api.get('/customers', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/customers');
      setCustomers(data);
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

  // Fetched once per customer (not per date filter) — used only to find
  // who actually collected a cash/online recovery, for the description
  // enrichment below. Best-effort: ledger still works fine if this fails.
  useEffect(() => {
    if (!customerId) { setCustomerPayments([]); return; }
    api.get('/payments', { params: { customer_id: customerId } })
      .then((r) => setCustomerPayments(r.data.data || []))
      .catch(() => setCustomerPayments([]));
  }, [customerId]);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const totalDebit = entries.filter((e) => e.entry_type === 'debit').reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredit = entries.filter((e) => e.entry_type === 'credit').reduce((sum, e) => sum + Number(e.amount), 0);

  // Backend returns newest-first; a ledger reads naturally oldest-first,
  // like a bank statement, with Opening Balance as the literal first row —
  // which also makes "what did they owe before this date range" obvious
  // without needing a separate query.
  const chronoEntries = [...entries].reverse();
  const oldest = chronoEntries[0];
  const openingBalance = oldest
    ? Number(oldest.running_balance) - (oldest.entry_type === 'debit' ? Number(oldest.amount) : -Number(oldest.amount))
    : Number(currentBalance);
  const openingRow = {
    id: '__opening-balance__',
    isOpeningBalance: true,
    created_at: fromDate ? `${fromDate}T00:00:00` : oldest?.created_at,
    description: fromDate ? 'Opening Balance (as of start date)' : 'Opening Balance',
    running_balance: openingBalance,
  };
  const displayRows = [openingRow, ...chronoEntries];

  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pageEntries = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    const head = ['Date', 'Description', 'Billed (+)', 'Received (-)', 'Balance', 'Type'];
    const rows = [
      [
        openingRow.created_at ? new Date(openingRow.created_at).toLocaleDateString('en-GB') : '',
        openingRow.description, '', '', Number(openingRow.running_balance), 'Opening',
      ],
      ...chronoEntries.map((e) => [
        new Date(e.created_at).toLocaleDateString('en-GB'),
        enrichRecoveryDescription(e, customerPayments) || '',
        e.entry_type === 'debit' ? Number(e.amount) : '',
        e.entry_type === 'credit' ? Number(e.amount) : '',
        Number(e.running_balance),
        typeLabel(e)
      ]),
    ];
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
        <div className="flex gap-2 items-center">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
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
              <div className="bg-white rounded-2xl shadow-card border border-blue-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center text-blue-600">
                    <TrendingDown size={18} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-500">Total Billed</h3>
                </div>
                <div className="text-[26px] leading-tight font-bold text-blue-600">
                  PKR {totalDebit.toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-card border border-emerald-100 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <TrendingUp size={18} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-500">Total Received</h3>
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

            {entries.length === 0 && Number(openingBalance) === 0 ? (
              <EmptyState icon={BookOpen} title="No ledger entries" subtitle="Entries will appear here as orders, payments and adjustments occur" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Billed (+)</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Received (-)</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-center">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((entry, i) => (
                        entry.isOpeningBalance ? (
                          <tr key={entry.id} className="border-b border-gray-100 bg-navy-chip/30">
                            <td className="px-6 py-3.5 whitespace-nowrap text-gray-500">
                              {entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-GB') : '—'}
                            </td>
                            <td className="px-6 py-3.5 text-navy font-bold" colSpan={3}>{entry.description}</td>
                            <td className="px-6 py-3.5 text-right font-bold text-navy">
                              PKR {Number(entry.running_balance).toLocaleString()}
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-navy-chip text-navy">
                                Opening
                              </span>
                            </td>
                          </tr>
                        ) : (
                        <tr
                          key={entry.id}
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3.5 whitespace-nowrap text-gray-500">
                            {new Date(entry.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-6 py-3.5 text-navy font-medium">
                            <DescriptionCell
                              description={enrichRecoveryDescription(entry, customerPayments)}
                              onViewOrderNumber={onViewOrderNumber}
                            />
                          </td>
                          <td className="px-6 py-3.5 text-right text-blue-600 font-medium">
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
                        )
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
                  <span className="text-xs text-gray-400">
                    Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, displayRows.length)} of {displayRows.length} entries
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
                  Billed (customer owes more)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entry_type"
                    checked={form.entry_type === 'credit'}
                    onChange={() => setForm({ ...form, entry_type: 'credit' })}
                  />
                  Received (reduces balance)
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
