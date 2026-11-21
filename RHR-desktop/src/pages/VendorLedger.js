import React, { useEffect, useState, useCallback, useRef } from 'react';
import { BookOpen, TrendingDown, TrendingUp, Wallet, X, Banknote, Building2, FileText, ImagePlus, Trash2, Pencil, Check, ChevronDown, ChevronUp, Info, Download } from 'lucide-react';
import { exportLedgerPdf, pdfAmount, pdfDate } from '../utils/ledgerPdf';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const PAGE_SIZE = 10;

const PAYMENT_METHODS = [
  { value: 'cash',   label: 'Cash',   icon: Banknote },
  { value: 'bank',   label: 'Bank Transfer', icon: Building2 },
  { value: 'cheque', label: 'Cheque', icon: FileText },
];

function typeLabel(entry) {
  if (!entry) return '';
  if (entry.reference_type === 'opening_balance') return 'Opening';
  if (entry.reference_type === 'purchase') return 'Purchase';
  if (entry.reference_type === 'payment') return 'Payment';
  return entry.entry_type === 'debit' ? 'Billed' : 'Paid';
}

function typeBadgeClass(entry) {
  const t = (entry.reference_type || entry.entry_type || '').toLowerCase();
  if (t === 'payment' || t === 'credit') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  if (t === 'purchase' || t === 'debit') return 'bg-blue-50 text-blue-600 border border-blue-100';
  if (t === 'opening_balance') return 'bg-purple-50 text-purple-600 border border-purple-100';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
}

const fmtPKR = (n) => 'PKR ' + Number(n || 0).toLocaleString();

// Parse structured details from the description string
function parseEntryDetails(entry) {
  const desc = entry.description || '';
  const details = {};

  // Payment entries: "Vendor payment to X — YYYY-MM-DD — Payment via {method} — {bank} Ref: {ref} ({notes})"
  if (entry.reference_type === 'payment' || entry.reference_type === 'vendor_transfer') {
    const methodMatch = desc.match(/Payment via (\w+)/i);
    if (methodMatch) details.method = methodMatch[1];

    // Bank name: after "Payment via method —" or "Payment via method"
    const bankMatch = desc.match(/Payment via \w+\s*[—\-]\s*([^(—\n]+)/i);
    if (bankMatch) details.bank = bankMatch[1].replace(/Ref:.*/i, '').trim().replace(/\s*$/, '');

    // Reference number
    const refMatch = desc.match(/Ref:\s*([^\s(—]+)/i);
    if (refMatch) details.ref = refMatch[1];

    // Notes in parentheses
    const notesMatch = desc.match(/\(([^)]+)\)/);
    if (notesMatch) details.notes = notesMatch[1];

    // Date
    const dateMatch = desc.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) details.paymentDate = dateMatch[1];

    // Cheque details
    const chequeMatch = desc.match(/Cheque#?\s*([^\s]+)/i);
    if (chequeMatch) details.chequeNumber = chequeMatch[1];
    const chequeDateMatch = desc.match(/dated\s+([\d-]+)/i);
    if (chequeDateMatch) details.chequeDate = chequeDateMatch[1];
  }

  // Purchase entries
  if (entry.reference_type === 'purchase') {
    const qtyMatch = desc.match(/(\d+)\s*(bag|ton|kg|pcs|piece)/i);
    if (qtyMatch) details.quantity = `${qtyMatch[1]} ${qtyMatch[2]}`;
  }

  return details;
}

export default function VendorLedger({ initialSupplierId }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);

  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [supplierId, setSupplierId] = useState(initialSupplierId || '');

  const [entries, setEntries] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  // Add Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '', payment_method: 'cash', notes: '',
    bank_account_id: '', bank_name: '', reference_number: '',
    cheque_number: '', cheque_date: '', cheque_bank: '', cheque_bank_account_id: '',
    payment_date: new Date().toISOString().split('T')[0],
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [receiptFile, setReceiptFile] = useState(null);
  const receiptInputRef = useRef(null);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [pendingChanges, setPendingChanges] = useState({});
  const [editingDateId, setEditingDateId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ entry_type: 'debit', amount: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const [suppData, bankData] = await Promise.all([
        companyFilter
          ? (await api.get('/suppliers', { params: { company_id: companyFilter } })).data.data || []
          : fetchAllCities('/suppliers'),
        companyFilter
          ? (await api.get('/bank/accounts', { params: { company_id: companyFilter } })).data.data || []
          : fetchAllCities('/bank/accounts'),
      ]);
      setSuppliers(suppData);
      setBankAccounts(bankData);
      // Switching city must not keep showing the previous city's supplier
      setSupplierId((cur) => (cur && !suppData.some((s) => s.id === cur) ? '' : cur));
    } catch {
      toast.error('Failed to load supplier list.');
    } finally {
      setSuppliersLoading(false);
    }
  };

  const loadLedger = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/suppliers/${supplierId}/ledger`);
      setEntries(res.data?.data?.entries || []);
      setCurrentBalance(res.data?.data?.currentBalance ?? 0);
      setPage(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load ledger.');
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  // Amount edits on vendor transfers wait for approval — show which entries have one pending.
  const loadPendingChanges = useCallback(async () => {
    if (!supplierId) { setPendingChanges({}); return; }
    try {
      const companyId = suppliers.find((s) => s.id === supplierId)?.company_id;
      const res = await api.get('/recovery/amount-changes', { params: { supplier_id: supplierId, ...(companyId ? { company_id: companyId } : {}) } });
      setPendingChanges(Object.fromEntries((res.data?.data || []).map((r) => [r.supplier_ledger_entry_id, r])));
    } catch {
      setPendingChanges({});
    }
  }, [supplierId, suppliers]);

  useEffect(() => { loadPendingChanges(); }, [loadPendingChanges]);

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this ledger entry? This cannot be undone.')) return;
    try {
      await api.delete(`/suppliers/${supplierId}/ledger/${entryId}`);
      toast.success('Entry deleted.');
      loadLedger();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete entry.');
    }
  };

  const handleEditSave = async (entryId) => {
    if (!editAmount || Number(editAmount) <= 0) { toast.error('Enter a valid amount.'); return; }
    setSavingEdit(true);
    try {
      const res = await api.patch(`/suppliers/${supplierId}/ledger/${entryId}`, { amount: Number(editAmount) });
      if (res.data?.data?.pending) {
        toast.success('Amount change sent for approval — it applies everywhere once approved in Salesman Recovery → Pending Approvals.');
      } else {
        toast.success('Amount updated.');
      }
      setEditingEntryId(null);
      loadLedger();
      loadPendingChanges();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update amount.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDateSave = async (entryId) => {
    if (!editDate) { toast.error('Select a date.'); return; }
    setSavingEdit(true);
    try {
      await api.patch(`/suppliers/${supplierId}/ledger/${entryId}`, { entry_date: editDate });
      toast.success('Date updated.');
      setEditingDateId(null);
      setEditDate('');
      loadLedger();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update date.');
    } finally {
      setSavingEdit(false);
    }
  };

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const chronoEntries = [...entries].reverse();
  const totalDebit  = entries.filter((e) => e.entry_type === 'debit').reduce((sum, e)  => sum + Number(e.amount), 0);
  const totalCredit = entries.filter((e) => e.entry_type === 'credit').reduce((sum, e) => sum + Number(e.amount), 0);

  const totalPages = Math.max(1, Math.ceil(chronoEntries.length / PAGE_SIZE));
  const pageEntries = chronoEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Whole ledger (all pages), oldest first, as a downloadable statement
  const handleDownloadPdf = async () => {
    try {
      await exportLedgerPdf({
        title: `Vendor Ledger — ${selectedSupplier?.name || 'Supplier'}`,
        subtitle: `${selectedSupplier?.contact_number ? `${selectedSupplier.contact_number} · ` : ''}Statement — ${new Date().toLocaleDateString('en-GB')}`,
        head: ['#', 'Date', 'Description', 'Type', 'Debit (Owe)', 'Credit (Paid)', 'Balance'],
        body: chronoEntries.map((e, i) => [
          i + 1,
          pdfDate(e.created_at),
          e.description || '',
          typeLabel(e),
          e.entry_type === 'debit' ? pdfAmount(e.amount) : '-',
          e.entry_type === 'credit' ? pdfAmount(e.amount) : '-',
          `PKR ${Number(e.running_balance || 0).toLocaleString()}`,
        ]),
        rightCols: [4, 5, 6],
        summary: [
          ['Total Purchases', pdfAmount(totalDebit)],
          ['Total Payments', pdfAmount(totalCredit)],
          [currentBalance >= 0 ? 'Balance (you owe)' : 'Balance (supplier owes you)', `PKR ${Math.abs(currentBalance).toLocaleString()}`],
        ],
        fileName: `Vendor-Ledger-${selectedSupplier?.name || 'supplier'}`,
      });
    } catch (err) {
      toast.error('Could not create PDF: ' + err.message);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustForm.amount || !adjustForm.description) { toast.error('Amount and description are required.'); return; }
    setSaving(true);
    try {
      await api.post(`/suppliers/${supplierId}/ledger/adjustment`, {
        entry_type:  adjustForm.entry_type,
        amount:      Number(adjustForm.amount),
        description: adjustForm.description,
      });
      toast.success('Ledger entry added.');
      setShowAdjustModal(false);
      setAdjustForm({ entry_type: 'debit', amount: '', description: '' });
      loadLedger();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add entry.');
    } finally {
      setSaving(false);
    }
  };

  const uploadReceipt = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api.post('/storage/upload', {
      bucket: 'expense-receipts',
      fileName: file.name,
      fileBase64: base64,
      mimeType: file.type,
    });
    return res.data.data.url;
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) { toast.error('Enter a positive amount.'); return; }
    setSavingPayment(true);
    try {
      const method = paymentForm.payment_method;
      let desc = `${paymentForm.payment_date} — Payment via ${method}`;
      if (method === 'bank' && paymentForm.bank_name) desc += ` — ${paymentForm.bank_name}`;
      if (method === 'bank' && paymentForm.reference_number) desc += ` Ref: ${paymentForm.reference_number}`;
      if (method === 'cheque') {
        if (paymentForm.cheque_bank) desc += ` — ${paymentForm.cheque_bank}`;
        if (paymentForm.cheque_number) desc += ` Cheque#${paymentForm.cheque_number}`;
        if (paymentForm.cheque_date) desc += ` dated ${paymentForm.cheque_date}`;
      }
      if (paymentForm.notes) desc += ` (${paymentForm.notes})`;

      const receipt_url = receiptFile ? await uploadReceipt(receiptFile) : null;

      await api.post(`/suppliers/${supplierId}/ledger/adjustment`, {
        entry_type:      'credit',
        amount:          Number(paymentForm.amount),
        description:     desc,
        reference_type:  'payment',
        receipt_url,
        payment_method:  method,
        payment_date:    paymentForm.payment_date,
        bank_account_id: method === 'bank' ? (paymentForm.bank_account_id || null)
          : method === 'cheque' ? (paymentForm.cheque_bank_account_id || null)
          : null,
      });
      toast.success('Payment recorded.');
      setShowPaymentModal(false);
      setReceiptFile(null);
      setPaymentForm({
        amount: '', payment_method: 'cash', notes: '',
        bank_account_id: '', bank_name: '', reference_number: '',
        cheque_number: '', cheque_date: '', cheque_bank: '', cheque_bank_account_id: '',
        payment_date: new Date().toISOString().split('T')[0],
      });
      loadLedger();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Vendor Ledger</h1>
          <p className="text-sm text-gray-500 mt-1">Track purchases and payments for each supplier.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <Button
            variant="accent"
            onClick={() => setShowPaymentModal(true)}
            disabled={!supplierId}
            className="flex items-center gap-1.5 disabled:opacity-50"
          >
            <Wallet size={16} /> Add Payment
          </Button>
        </div>
      </div>

      {/* Supplier selector */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Select Supplier</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          disabled={suppliersLoading}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
        >
          <option value="">— Select a supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {!supplierId ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100">
          <EmptyState icon={BookOpen} title="Select a supplier" subtitle="Choose a supplier above to view their ledger" />
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100">
          <SkeletonTable rows={5} cols={5} />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Current Balance</p>
              <p className={`text-2xl font-bold ${currentBalance > 0 ? 'text-red-600' : currentBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {fmtPKR(Math.abs(currentBalance))}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {currentBalance > 0 ? 'Amount you owe this supplier' : currentBalance < 0 ? 'Supplier owes you (overpaid)' : 'Account settled'}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5"><TrendingUp size={13} /> Total Purchases</p>
              <p className="text-2xl font-bold text-blue-600">{fmtPKR(totalDebit)}</p>
              <p className="text-xs text-gray-400 mt-1">Total billed / debited</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1.5"><TrendingDown size={13} /> Total Payments</p>
              <p className="text-2xl font-bold text-emerald-600">{fmtPKR(totalCredit)}</p>
              <p className="text-xs text-gray-400 mt-1">Total paid / credited</p>
            </div>
          </div>

          {/* Ledger table */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-navy text-[15px]">{selectedSupplier?.name}</h2>
                {selectedSupplier?.contact_number && (
                  <p className="text-xs text-gray-400 mt-0.5">{selectedSupplier.contact_number}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {currentBalance > 0 ? `You owe ${fmtPKR(currentBalance)}` : currentBalance < 0 ? `They owe ${fmtPKR(Math.abs(currentBalance))}` : 'Settled'}
                </span>
                <button
                  onClick={handleDownloadPdf}
                  disabled={chronoEntries.length === 0}
                  className="flex items-center gap-1.5 text-navy border border-navy/30 hover:bg-navy hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  title="Download this ledger as PDF"
                >
                  <Download size={13} /> PDF
                </button>
              </div>
            </div>

            {chronoEntries.length === 0 ? (
              <EmptyState icon={BookOpen} title="No transactions yet" subtitle="Purchases and payments for this supplier will appear here" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-left text-gray-500">
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Debit (owe)</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Credit (paid)</th>
                        <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                        <th className="px-3 py-3 w-8 text-center"><Info size={12} /></th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageEntries.map((e, i) => {
                        const isExpanded = expandedRowId === e.id;
                        const details = isExpanded ? parseEntryDetails(e) : null;
                        const isPayment = e.reference_type === 'payment' || e.reference_type === 'vendor_transfer';
                        return (
                          <React.Fragment key={e.id}>
                            <tr className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${isExpanded ? 'bg-blue-50/30' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                              <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">
                                {editingDateId === e.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="date"
                                      value={editDate}
                                      onChange={(ev) => setEditDate(ev.target.value)}
                                      className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-navy w-32"
                                      autoFocus
                                      onKeyDown={(ev) => { if (ev.key === 'Enter') handleDateSave(e.id); if (ev.key === 'Escape') setEditingDateId(null); }}
                                    />
                                    <button onClick={() => handleDateSave(e.id)} disabled={savingEdit} className="text-emerald-600 hover:text-emerald-800"><Check size={13} /></button>
                                    <button onClick={() => setEditingDateId(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 group">
                                    {new Date(e.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    <button
                                      onClick={() => { setEditingDateId(e.id); setEditDate((e.created_at || '').split('T')[0]); }}
                                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-gray-400 hover:text-navy p-0.5"
                                      title="Edit date"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-3 text-gray-700 max-w-[300px]">
                                <span className="line-clamp-2">{e.description || '—'}</span>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${typeBadgeClass(e)}`}>
                                  {typeLabel(e)}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-red-600">
                                {e.entry_type === 'debit' ? fmtPKR(e.amount) : '—'}
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-emerald-600">
                                {e.entry_type === 'credit' ? (
                                  editingEntryId === e.id ? (
                                    <div className="flex items-center gap-1 justify-end">
                                      <input
                                        type="number" min="0.01" step="0.01"
                                        value={editAmount}
                                        onChange={(ev) => setEditAmount(ev.target.value)}
                                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-navy"
                                        autoFocus
                                        onKeyDown={(ev) => { if (ev.key === 'Enter') handleEditSave(e.id); if (ev.key === 'Escape') setEditingEntryId(null); }}
                                      />
                                      <button onClick={() => handleEditSave(e.id)} disabled={savingEdit} className="text-emerald-600 hover:text-emerald-800"><Check size={13} /></button>
                                      <button onClick={() => setEditingEntryId(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                                    </div>
                                  ) : (
                                    <div>
                                      <button
                                        onClick={() => { setEditingEntryId(e.id); setEditAmount(String(e.amount)); }}
                                        className="font-medium text-emerald-600 hover:text-emerald-800 flex items-center gap-1 ml-auto group"
                                      >
                                        {fmtPKR(e.amount)}
                                        <Pencil size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                                      </button>
                                      {pendingChanges[e.id] && (
                                        <span
                                          className="block text-[10px] font-semibold text-amber-600 mt-0.5"
                                          title={`Requested by ${pendingChanges[e.id].requested_by_name || 'an admin'}`}
                                        >
                                          → {fmtPKR(pendingChanges[e.id].new_amount)} awaiting approval
                                        </span>
                                      )}
                                    </div>
                                  )
                                ) : '—'}
                              </td>
                              <td className="px-5 py-3 text-right font-bold text-navy">
                                {fmtPKR(e.running_balance)}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  onClick={() => setExpandedRowId(isExpanded ? null : e.id)}
                                  className={`p-1 rounded transition-colors ${isExpanded ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-gray-300 hover:text-blue-400 hover:bg-blue-50'}`}
                                  title="View details"
                                >
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  onClick={() => handleDeleteEntry(e.id)}
                                  className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                                  title="Delete entry"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-blue-50/20 border-b border-blue-100">
                                <td colSpan={8} className="px-6 py-4">
                                  <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-3 flex items-center gap-1.5">
                                      <Info size={11} /> Entry Details
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Amount</p>
                                        <p className="font-semibold text-navy">{fmtPKR(e.amount)}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Entry Type</p>
                                        <p className="font-medium text-gray-700 capitalize">{e.entry_type}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Reference Type</p>
                                        <p className="font-medium text-gray-700 capitalize">{(e.reference_type || '—').replace(/_/g, ' ')}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Date Recorded</p>
                                        <p className="font-medium text-gray-700">
                                          {new Date(e.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                      </div>
                                      {isPayment && details?.method && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Payment Method</p>
                                          <p className="font-medium text-gray-700 capitalize">{details.method === 'bank' ? 'Bank Transfer' : details.method}</p>
                                        </div>
                                      )}
                                      {isPayment && details?.bank && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Bank</p>
                                          <p className="font-medium text-gray-700">{details.bank}</p>
                                        </div>
                                      )}
                                      {isPayment && details?.ref && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Reference No.</p>
                                          <p className="font-medium text-gray-700">{details.ref}</p>
                                        </div>
                                      )}
                                      {isPayment && details?.chequeNumber && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Cheque No.</p>
                                          <p className="font-medium text-gray-700">{details.chequeNumber}</p>
                                        </div>
                                      )}
                                      {isPayment && details?.chequeDate && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Cheque Date</p>
                                          <p className="font-medium text-gray-700">{details.chequeDate}</p>
                                        </div>
                                      )}
                                      {isPayment && details?.paymentDate && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Payment Date</p>
                                          <p className="font-medium text-gray-700">{details.paymentDate}</p>
                                        </div>
                                      )}
                                      {details?.notes && (
                                        <div className="col-span-2">
                                          <p className="text-xs text-gray-400 mb-0.5">Notes</p>
                                          <p className="font-medium text-gray-700">{details.notes}</p>
                                        </div>
                                      )}
                                      {details?.quantity && (
                                        <div>
                                          <p className="text-xs text-gray-400 mb-0.5">Quantity</p>
                                          <p className="font-medium text-gray-700">{details.quantity}</p>
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                      <p className="text-xs text-gray-400">Full description:</p>
                                      <p className="text-xs text-gray-600 mt-0.5 break-words">{e.description || '—'}</p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                    <span>{chronoEntries.length} entries</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        ← Prev
                      </button>
                      <span className="px-2">Page {page} / {totalPages}</span>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="px-3 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Add Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-navy">Record Payment</h2>
                <p className="text-xs text-gray-400 mt-0.5">Payment made TO {selectedSupplier?.name}</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (PKR)</label>
                <input
                  type="number" min="0.01" step="0.01" required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentForm({ ...paymentForm, payment_method: value })}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-sm font-medium transition-colors ${
                        paymentForm.payment_method === value
                          ? 'border-navy bg-navy text-white'
                          : 'border-gray-200 text-gray-600 hover:border-navy/40 hover:bg-gray-50'
                      }`}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentForm.payment_method === 'bank' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Account</label>
                    <select
                      value={paymentForm.bank_account_id}
                      onChange={(e) => {
                        const acct = bankAccounts.find((b) => b.id === e.target.value);
                        setPaymentForm({ ...paymentForm, bank_account_id: e.target.value, bank_name: acct?.bank_name || '' });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white"
                    >
                      <option value="">— Select bank —</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Reference / Transaction Number</label>
                    <input
                      type="text"
                      value={paymentForm.reference_number}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                      placeholder="e.g. TXN123456"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                    />
                  </div>
                </>
              )}

              {paymentForm.payment_method === 'cheque' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Account</label>
                    <select
                      value={paymentForm.cheque_bank_account_id}
                      onChange={(e) => {
                        const acct = bankAccounts.find((b) => b.id === e.target.value);
                        setPaymentForm({ ...paymentForm, cheque_bank_account_id: e.target.value, cheque_bank: acct?.bank_name || '' });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white"
                    >
                      <option value="">— Select bank —</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cheque Number</label>
                      <input
                        type="text"
                        value={paymentForm.cheque_number}
                        onChange={(e) => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })}
                        placeholder="0001234"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Cheque Date</label>
                      <input
                        type="date"
                        value={paymentForm.cheque_date}
                        onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="e.g. Against invoice #1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Receipt / Proof of Payment <span className="text-red-500">*</span>
                </label>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                />
                {receiptFile ? (
                  <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2.5">
                    <img
                      src={URL.createObjectURL(receiptFile)}
                      alt="Receipt preview"
                      className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{receiptFile.name}</p>
                      <p className="text-xs text-gray-400">{(receiptFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button type="button" onClick={() => { setReceiptFile(null); if (receiptInputRef.current) receiptInputRef.current.value = ''; }}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg px-3 py-4 flex flex-col items-center gap-1.5 text-gray-400 hover:border-navy hover:text-navy transition-colors"
                  >
                    <ImagePlus size={20} />
                    <span className="text-sm">Tap to attach receipt photo</span>
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => { setShowPaymentModal(false); setReceiptFile(null); }}>Cancel</Button>
                <Button type="submit" variant="accent" disabled={savingPayment}>{savingPayment ? 'Uploading…' : 'Record Payment'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
