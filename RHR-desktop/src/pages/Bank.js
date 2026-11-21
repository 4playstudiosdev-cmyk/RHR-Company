import React, { useEffect, useState } from 'react';
import { Landmark, Plus, ArrowLeftRight, BookOpen, RefreshCw, Pencil, Trash2, Download } from 'lucide-react';
import { exportLedgerPdf, pdfAmount, pdfDate } from '../utils/ledgerPdf';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const fmtPKR = (n) => `Rs ${Number(n || 0).toLocaleString()}`;

const EMPTY_ACCOUNT_FORM = { account_name: '', account_number: '', bank_name: '', branch_name: '', opening_balance: '', opening_balance_date: '' };
const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

export default function Bank() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
  const [saving, setSaving] = useState(false);
  const [savingOpeningBal, setSavingOpeningBal] = useState(null);
  const [ledgerAccount, setLedgerAccount] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [isMergedLedger, setIsMergedLedger] = useState(false);
  const [txnDateFilter, setTxnDateFilter] = useState('all');
  const [txnTypeFilter, setTxnTypeFilter] = useState('all');
  const [ledgerDateFilter, setLedgerDateFilter] = useState('all');
  const [bankSummary, setBankSummary] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const openLedger = async (account) => {
    setLedgerAccount(account);
    setLedgerData(null);
    setLedgerLoading(true);
    setTab('ledger');
    setLedgerDateFilter('all');
    const merged = selectedCity === 'all';
    setIsMergedLedger(merged);
    try {
      if (merged) {
        const res = await api.get('/bank/merged-ledger', { params: { bank_name: account.bank_name } });
        // Shape it like single-account ledger so the same table renders
        setLedgerData({ account, entries: res.data.data.entries, isMerged: true, accounts: res.data.data.accounts, total_balance: res.data.data.total_balance });
      } else {
        const res = await api.get(`/bank/accounts/${account.id}/ledger`);
        setLedgerData(res.data.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const getDateRange = (f) => {
    const t = new Date();
    const ts = t.toISOString().split('T')[0];
    if (f === 'today') return { from: ts, to: ts };
    if (f === 'yesterday') { const y = new Date(t); y.setDate(y.getDate() - 1); const ys = y.toISOString().split('T')[0]; return { from: ys, to: ys }; }
    if (f === 'week') { const w = new Date(t); w.setDate(w.getDate() - 6); return { from: w.toISOString().split('T')[0], to: ts }; }
    if (f === 'month') { return { from: ts.slice(0, 7) + '-01', to: ts }; }
    return null;
  };

  useEffect(() => {
    // A ledger opened for one city must not stay on screen under another city
    setLedgerAccount(null);
    setLedgerData(null);
    setIsMergedLedger(false);
    setTab((t) => (t === 'ledger' ? 'accounts' : t));
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const handleLedgerPdf = async () => {
    if (!ledgerData) return;
    const name = isMergedLedger ? `${ledgerAccount?.bank_name} — All Cities` : ledgerAccount?.account_name;
    const rows = filteredLedgerEntries;
    const last = rows.length ? rows[rows.length - 1].balance : 0;
    try {
      await exportLedgerPdf({
        title: `Bank Ledger — ${name || 'Account'}`,
        subtitle: `${isMergedLedger ? 'Merged ledger' : `${ledgerAccount?.bank_name || ''}${ledgerAccount?.account_number ? ` · #${ledgerAccount.account_number}` : ''}`} · ${ledgerDateFilter === 'all' ? 'All dates' : ledgerDateFilter} · ${new Date().toLocaleDateString('en-GB')}`,
        head: ['#', 'Date', ...(isMergedLedger ? ['Branch'] : []), 'Description', 'Debit (In)', 'Credit (Out)', 'Balance'],
        body: rows.map((e, i) => [
          i + 1,
          pdfDate(e.date),
          ...(isMergedLedger ? [e.branch || ''] : []),
          e.type === 'opening' ? (isMergedLedger ? e.description : 'Opening Balance') : e.description,
          e.debit > 0 ? pdfAmount(e.debit) : '-',
          e.credit > 0 ? pdfAmount(e.credit) : '-',
          `PKR ${Number(e.balance || 0).toLocaleString()}`,
        ]),
        rightCols: isMergedLedger ? [4, 5, 6] : [3, 4, 5],
        summary: [
          ['Total In', pdfAmount(rows.reduce((s, e) => s + (e.type === 'opening' ? 0 : Number(e.debit || 0)), 0))],
          ['Total Out', pdfAmount(rows.reduce((s, e) => s + (e.type === 'opening' ? 0 : Number(e.credit || 0)), 0))],
          ['Closing Balance', `PKR ${Number(last || 0).toLocaleString()}`],
        ],
        fileName: `Bank-Ledger-${name || 'account'}`,
        landscape: true,
      });
    } catch (err) {
      toast.error('Could not create PDF: ' + err.message);
    }
  };

  const handleTransactionsPdf = async () => {
    const rows = filteredTransactions;
    const isOut = (t) => t.type === 'expense' || t.type === 'cash_deposit';
    try {
      await exportLedgerPdf({
        title: 'Bank Transactions',
        subtitle: `${txnDateFilter === 'all' ? 'All dates' : txnDateFilter}${txnTypeFilter !== 'all' ? ` · ${txnTypeFilter}` : ''} · ${new Date().toLocaleDateString('en-GB')}`,
        head: ['#', 'Date', 'Type', 'Account', 'Details', 'In', 'Out'],
        body: rows.map((t, i) => [
          i + 1,
          pdfDate(t.created_at),
          t.type === 'expense' ? 'Expense' : t.type === 'cash_deposit' ? 'Cash Deposit' : 'Payment',
          t.bank_accounts ? `${t.bank_accounts.account_name || t.bank_accounts.bank_name || ''}` : 'Cash in Hand',
          isOut(t) ? `${t.category || ''}${t.description ? ` — ${t.description}` : ''}` : (t.salesman?.full_name || t.customer?.full_name || '-'),
          isOut(t) ? '-' : pdfAmount(t.amount),
          isOut(t) ? pdfAmount(t.amount) : '-',
        ]),
        rightCols: [5, 6],
        summary: [
          ['Total In', pdfAmount(rows.filter((t) => !isOut(t)).reduce((s, t) => s + Number(t.amount || 0), 0))],
          ['Total Out', pdfAmount(rows.filter(isOut).reduce((s, t) => s + Number(t.amount || 0), 0))],
        ],
        fileName: 'Bank-Transactions',
        landscape: true,
      });
    } catch (err) {
      toast.error('Could not create PDF: ' + err.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { company_id: companyFilter };
      const [accountsData, transactionsData] = companyFilter
        ? await Promise.all([
            api.get('/bank/accounts', { params }).then((r) => r.data.data || []),
            api.get('/bank/transactions', { params }).then((r) => r.data.data || [])
          ])
        : await Promise.all([
            fetchAllCities('/bank/accounts'),
            fetchAllCities('/bank/transactions')
          ]);
      setAccounts(accountsData);
      setTransactions(transactionsData);
      try {
        const sumResp = await api.get('/bank/summary', { params: companyFilter ? params : {} });
        setBankSummary(sumResp.data?.data || null);
      } catch (_) { setBankSummary(null); }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bank data.');
    } finally {
      setLoading(false);
    }
  };

  const openEditAccount = (account) => {
    setEditAccount(account);
    setEditForm({ account_name: account.account_name, account_number: account.account_number, bank_name: account.bank_name, branch_name: account.branch_name || '' });
  };

  const handleEditAccount = async (e) => {
    e.preventDefault();
    if (!editForm.account_name || !editForm.account_number || !editForm.bank_name) {
      toast.error('Account name, account number and bank name are required.');
      return;
    }
    setEditSaving(true);
    try {
      await api.patch(`/bank/accounts/${editAccount.id}`, editForm);
      setAccounts((prev) => prev.map((a) => a.id === editAccount.id ? { ...a, ...editForm } : a));
      toast.success('Account updated.');
      setEditAccount(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update account.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteAccount = async (account) => {
    const txnCount = transactions.filter((t) => {
      if (t.bank_accounts?.account_name === account.account_name) return true;
      return false;
    }).length;
    const msg = `DELETE "${account.account_name}"?\n\nThis will permanently delete the bank account AND all its linked payments, expenses, and transactions from Supabase.\n\nType the account name to confirm:`;
    const typed = window.prompt(msg);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== account.account_name.trim().toLowerCase()) {
      window.alert('Name did not match — delete cancelled.');
      return;
    }
    setDeletingId(account.id);
    try {
      await api.delete(`/bank/accounts/${account.id}`);
      toast.success(`"${account.account_name}" deleted along with all linked transactions.`);
      if (ledgerAccount?.id === account.id) { setLedgerAccount(null); setLedgerData(null); }
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateOpeningBalance = async (account, newVal) => {
    const parsed = parseFloat(newVal);
    if (isNaN(parsed)) return;
    if (parsed === Number(account.opening_balance || 0)) return;
    setSavingOpeningBal(account.id);
    try {
      await api.patch(`/bank/accounts/${account.id}/opening-balance`, { opening_balance: parsed });
      setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, opening_balance: parsed } : a));
      toast.success(`Opening balance updated for ${account.account_name}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update opening balance.');
    } finally {
      setSavingOpeningBal(null);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!form.account_name || !form.account_number || !form.bank_name) {
      toast.error('Account name, account number and bank name are required.');
      return;
    }
    setSaving(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/bank/accounts', {
        ...form,
        company_id: targetCompanyId,
        opening_balance: Number(form.opening_balance) || 0,
        opening_balance_date: form.opening_balance_date || null,
      });
      toast.success('Bank account added.');
      setShowAddModal(false);
      setForm(EMPTY_ACCOUNT_FORM);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add bank account.');
    } finally {
      setSaving(false);
    }
  };

  // Net movement — payments add to the bank balance, expenses and cash_deposits subtract.
  const totalTransactions = transactions.reduce(
    (s, t) => s + (t.type === 'expense' || t.type === 'cash_deposit' ? -Number(t.amount) : Number(t.amount)),
    0
  );

  const filteredTransactions = (() => {
    const range = getDateRange(txnDateFilter);
    return transactions.filter(t => {
      const d = (t.created_at || '').split('T')[0];
      const dateOk = !range || (d >= range.from && d <= range.to);
      const typeOk = txnTypeFilter === 'all' || t.type === txnTypeFilter;
      return dateOk && typeOk;
    });
  })();

  const filteredLedgerEntries = (() => {
    if (!ledgerData?.entries) return [];
    const range = getDateRange(ledgerDateFilter);
    if (!range) return ledgerData.entries;
    return ledgerData.entries.filter(e => {
      if (e.type === 'opening') return true;
      const d = (e.date || '').split('T')[0];
      return d >= range.from && d <= range.to;
    });
  })();

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Bank</h1>
          <p className="text-sm text-gray-500 mt-1">Bank accounts and recorded bank-transfer collections.</p>
        </div>
        <div className="flex items-center gap-3">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          {tab === 'accounts' && (
            <Button
              variant="accent"
              onClick={() => { setForm(EMPTY_ACCOUNT_FORM); setShowAddModal(true); }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Add Account
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setTab('accounts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'accounts' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Bank Accounts ({accounts.length})
        </button>
        <button
          onClick={() => setTab('transactions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'transactions' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Transactions ({transactions.length})
        </button>
        {ledgerAccount && (
          <div className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'ledger' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}>
            <button onClick={() => setTab('ledger')} className="flex items-center gap-1.5">
              <BookOpen size={14} /> {ledgerAccount.account_name}
            </button>
            <button
              onClick={() => { setLedgerAccount(null); setLedgerData(null); setIsMergedLedger(false); if (tab === 'ledger') setTab('accounts'); }}
              className="ml-1 opacity-60 hover:opacity-100 text-lg leading-none"
            >×</button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : tab === 'accounts' ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {accounts.length === 0 ? (
            <EmptyState icon={Landmark} title="No bank accounts yet" subtitle="Add one to start recording bank-transfer collections" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account Name</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account Number</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Bank</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Branch</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Opening Bal.</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Balance</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => {
                    const openingBal = Number(a.opening_balance || 0);
                    // Use summary (server-computed) balance — it uses the same formula as the ledger:
                    // Cash in Hand = opening + petty_cash_closings − cash_expenses
                    // Bank accounts = opening + bank_transfers_in + cheques_in − bank_expenses
                    const summaryAcct = (bankSummary?.accounts || []).find(acc => acc.id === a.id);
                    const bal = summaryAcct != null ? summaryAcct.current_balance : openingBal;
                    return (
                      <tr key={a.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy cursor-pointer hover:underline" onClick={() => openLedger(a)}>{a.account_name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{a.account_number}</td>
                        <td className="px-6 py-3.5 text-gray-600">{a.bank_name}</td>
                        <td className="px-6 py-3.5 text-gray-500">{a.branch_name || '—'}</td>
                        <td className="px-6 py-3.5 text-right">
                          <input
                            type="number"
                            defaultValue={openingBal}
                            onBlur={(e) => handleUpdateOpeningBalance(a, e.target.value)}
                            disabled={savingOpeningBal === a.id}
                            title="Click to set opening balance"
                            className="w-28 text-right border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-navy focus:border-navy bg-transparent hover:border-navy/40 cursor-pointer disabled:opacity-50"
                          />
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <p className={`font-bold text-sm ${bal >= 0 ? 'text-green-700' : 'text-red-600'}`}>PKR {Math.abs(bal).toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {openingBal > 0 ? `${openingBal.toLocaleString()} opening` : ''}
                          </p>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openLedger(a)}
                              className="flex items-center gap-1.5 text-xs font-medium text-navy border border-navy/30 hover:bg-navy hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <BookOpen size={13} /> Ledger
                            </button>
                            <button
                              onClick={() => openEditAccount(a)}
                              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                              title="Edit account details"
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(a)}
                              disabled={deletingId === a.id}
                              className="flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                              title="Delete account and all linked transactions"
                            >
                              {deletingId === a.id ? '...' : <><Trash2 size={13} /> Delete</>}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'ledger' ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {/* Ledger header */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-navy text-base">
                {isMergedLedger ? `${ledgerAccount?.bank_name} — All Cities` : ledgerAccount?.account_name}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {isMergedLedger
                  ? `Merged ledger across ${ledgerData?.accounts?.length || 0} accounts: ${(ledgerData?.accounts || []).map(a => a.account_name).join(', ')}`
                  : `${ledgerAccount?.bank_name}${ledgerAccount?.account_number ? ` · #${ledgerAccount.account_number}` : ''}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLedgerPdf}
                disabled={!ledgerData || ledgerLoading}
                className="flex items-center gap-1.5 text-xs font-medium text-navy border border-navy/30 hover:bg-navy hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                title="Download this ledger (current date filter) as PDF"
              >
                <Download size={13} /> PDF
              </button>
              <button onClick={() => setTab('accounts')} className="text-xs text-gray-500 hover:text-navy border border-gray-200 hover:border-navy px-3 py-1.5 rounded-lg transition-colors">
                ← Back to Accounts
              </button>
            </div>
          </div>
          {ledgerLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={22} className="animate-spin text-navy" />
            </div>
          ) : !ledgerData ? null : (
            <>
              {/* Ledger date filter */}
              <div className="px-6 py-3 border-b border-gray-100 flex gap-1.5 flex-wrap bg-gray-50/30">
                {[
                  { label: 'All', value: 'all' },
                  { label: 'Today', value: 'today' },
                  { label: 'Yesterday', value: 'yesterday' },
                  { label: 'Last 7 Days', value: 'week' },
                  { label: 'This Month', value: 'month' },
                ].map(f => (
                  <button
                    key={f.value}
                    onClick={() => setLedgerDateFilter(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      ledgerDateFilter === f.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                {ledgerDateFilter !== 'all' && (
                  <span className="text-xs text-gray-400 self-center ml-1">
                    {filteredLedgerEntries.filter(e => e.type !== 'opening').length} of {(ledgerData?.entries?.length ?? 1) - (isMergedLedger ? (ledgerData?.accounts?.length || 1) : 1)} entries
                  </span>
                )}
              </div>

              {/* Summary cards */}
              <div className="flex gap-4 px-6 py-4 border-b border-gray-100 flex-wrap bg-gray-50/30">
                {isMergedLedger ? (
                  <>
                    {(ledgerData.accounts || []).map(a => (
                      <div key={a.id} className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex-1 min-w-[140px]">
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{a.account_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.account_number ? `#${a.account_number}` : '—'}</p>
                      </div>
                    ))}
                    <div className="bg-white rounded-xl border border-navy/20 px-5 py-3 flex-1 min-w-[140px]">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Combined Balance</p>
                      <p className={`text-sm font-bold mt-0.5 ${(ledgerData.total_balance ?? 0) >= 0 ? 'text-navy' : 'text-red-600'}`}>{fmtPKR(ledgerData.total_balance ?? 0)}</p>
                    </div>
                  </>
                ) : (
                  [
                    { label: 'Account #', value: ledgerAccount?.account_number || '—' },
                    { label: 'Opening Balance', value: fmtPKR(ledgerData.account.opening_balance) },
                    { label: 'Current Balance', value: fmtPKR(ledgerData.entries.length ? ledgerData.entries[ledgerData.entries.length - 1].balance : 0), bold: true, color: 'text-navy' },
                  ].map(({ label, value, bold, color }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-100 px-5 py-3 flex-1 min-w-[140px]">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                      <p className={`text-sm mt-0.5 ${bold ? `font-bold ${color || ''}` : 'text-gray-700'}`}>{value}</p>
                    </div>
                  ))
                )}
              </div>
              {/* Ledger table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy text-white text-xs font-semibold uppercase tracking-wide">
                      {['#', 'Date', isMergedLedger ? 'Branch' : null, 'Description', 'Debit (In)', 'Credit (Out)', 'Balance'].filter(Boolean).map((h) => (
                        <th key={h} className={`px-5 py-3 ${['Debit (In)', 'Credit (Out)', 'Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedgerEntries.map((e, i) => (
                      <tr key={e.id} className={`border-b border-gray-50 last:border-0 ${e.type === 'opening' ? 'bg-blue-50' : i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {e.date ? new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        {isMergedLedger && (
                          <td className="px-5 py-3 text-xs whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-semibold ${
                              e.branch === 'Karachi' ? 'bg-blue-50 text-blue-700' :
                              e.branch === 'Sukkur'  ? 'bg-purple-50 text-purple-700' :
                              e.branch === 'Hyderabad' ? 'bg-orange-50 text-orange-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>{e.branch}</span>
                          </td>
                        )}
                        <td className="px-5 py-3 text-gray-700 text-xs">
                          {e.type === 'opening' ? <span className="font-semibold text-navy">{isMergedLedger ? e.description : 'Opening Balance'}</span> : e.description}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-green-700 text-xs">
                          {e.debit > 0 ? fmtPKR(e.debit) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-red-600 text-xs">
                          {e.credit > 0 ? fmtPKR(e.credit) : '—'}
                        </td>
                        <td className={`px-5 py-3 text-right font-bold text-xs ${e.balance >= 0 ? 'text-navy' : 'text-red-600'}`}>
                          {fmtPKR(e.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-semibold text-navy text-sm">Bank Transactions</h3>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-navy">Total: PKR {totalTransactions.toLocaleString()}</span>
              <button
                onClick={handleTransactionsPdf}
                disabled={filteredTransactions.length === 0}
                className="flex items-center gap-1.5 text-xs font-medium text-navy border border-navy/30 hover:bg-navy hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                title="Download the listed transactions as PDF"
              >
                <Download size={13} /> PDF
              </button>
            </div>
          </div>
          {/* Filters row */}
          <div className="px-6 py-3 border-b border-gray-100 flex gap-3 flex-wrap items-center bg-gray-50/30">
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: 'All Dates', value: 'all' },
                { label: 'Today', value: 'today' },
                { label: 'Yesterday', value: 'yesterday' },
                { label: 'Last 7 Days', value: 'week' },
                { label: 'This Month', value: 'month' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setTxnDateFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    txnDateFilter === f.value ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200 hidden sm:block" />
            <div className="flex gap-1.5">
              {[
                { label: 'All Types', value: 'all' },
                { label: 'Payments', value: 'payment' },
                { label: 'Expenses', value: 'expense' },
                { label: 'Cash Deposits', value: 'cash_deposit' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setTxnTypeFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    txnTypeFilter === f.value
                      ? f.value === 'expense' ? 'bg-red-600 text-white' : f.value === 'payment' ? 'bg-green-700 text-white' : f.value === 'cash_deposit' ? 'bg-orange-600 text-white' : 'bg-navy text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {(txnDateFilter !== 'all' || txnTypeFilter !== 'all') && (
              <span className="text-xs text-gray-400 self-center">
                {filteredTransactions.length} of {transactions.length} shown
              </span>
            )}
          </div>
          {filteredTransactions.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No transactions for this period" subtitle="Try a different date filter or switch to All" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Details</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((t, i) => (
                    <tr key={`${t.type}-${t.id}`} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${t.type === 'expense' ? 'bg-red-100 text-red-700' : t.type === 'cash_deposit' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {t.type === 'expense' ? 'Expense' : t.type === 'cash_deposit' ? 'Cash Deposit' : 'Payment'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-700">
                        {t.type === 'expense' || t.type === 'cash_deposit'
                          ? `${t.category}${t.description ? ` — ${t.description}` : ''}`
                          : (t.salesman?.full_name || t.customer?.full_name || '—')}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600">
                        {t.bank_accounts ? `${t.bank_accounts.account_name} — ${t.bank_accounts.bank_name}` : '—'}
                      </td>
                      <td className={`px-6 py-3.5 text-right font-semibold ${t.type === 'expense' ? 'text-red-600' : t.type === 'cash_deposit' ? 'text-orange-600' : 'text-green-700'}`}>
                        {t.type === 'expense' || t.type === 'cash_deposit' ? '−' : '+'}PKR {Number(t.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editAccount && (
        <Modal title={`Edit — ${editAccount.account_name}`} onClose={() => setEditAccount(null)}>
          <form onSubmit={handleEditAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
              <input value={editForm.account_name} onChange={(e) => setEditForm({ ...editForm, account_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
              <input value={editForm.account_number} onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
              <input value={editForm.bank_name} onChange={(e) => setEditForm({ ...editForm, bank_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
              <input value={editForm.branch_name} onChange={(e) => setEditForm({ ...editForm, branch_name: e.target.value })}
                placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditAccount(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <Button type="submit" loading={editSaving}>Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      {showAddModal && (
        <Modal title="Add Bank Account" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name *</label>
              <input
                type="text"
                required
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number *</label>
              <input
                type="text"
                required
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Name *</label>
              <input
                type="text"
                required
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Branch</label>
              <input
                type="text"
                value={form.branch_name}
                onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Opening Balance</label>
                <input
                  type="number"
                  min="0"
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">As of Date</label>
                <input
                  type="date"
                  value={form.opening_balance_date}
                  onChange={(e) => setForm({ ...form, opening_balance_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}
