import { PENDING_RING, PENDING_BADGE } from '../utils/pending';
import DateRangeFilter from '../components/DateRangeFilter';
import React, { useEffect, useState } from 'react';
import { Plus, Wallet, Smartphone, Clock3, ListChecks, Banknote, Trash2 } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { CITY_IDS, fetchAllCities } from '../utils/multiCityFetch';

const TABS = [
  { key: 'add', label: 'Add Recovery', icon: Plus },
  { key: 'closing', label: 'Cash Closing', icon: Wallet },
  { key: 'pending', label: 'Pending Approvals', icon: Clock3 },
  { key: 'history', label: 'History', icon: ListChecks },
];

const EMPTY_FORM = {
  salesman_id: '', customer_id: '', amount: '',
  payment_type: 'cash', payment_method: 'cash',
  reference_number: '', notes: '',
  recovery_date: new Date().toISOString().split('T')[0],
};

const EMPTY_CLOSING_FORM = { salesman_id: '', amount: '', deposit_to: 'bank', bank_account: '', notes: '' };

// When the payment was recorded, in Pakistan time (the app's own clock isn't used).
const recordedTime = (iso) => (iso
  ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: true })
  : '');

// Date, plus the exact time the salesman recorded it.
function WhenCell({ date, createdAt }) {
  return (
    <>
      <span className="block">{date}</span>
      {createdAt && <span className="block text-xs text-gray-400">{recordedTime(createdAt)}</span>}
    </>
  );
}

// "View photo" — the proof photo the salesman took in Record Payment.
function PhotoButton({ url, onOpen }) {
  if (!url) return <span className="text-gray-300">—</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
    >
      <img src={url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200" />
      View photo
    </button>
  );
}

export default function SalesmanRecovery({ initialTab, initialTabToken }) {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState(initialTab || 'add');
  // opened from a notification: jump to the tab it is about
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab, initialTabToken]);

  const [salesmenList, setSalesmenList] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [historySalesman, setHistorySalesman] = useState(''); // '' = every salesman
  const todayStr = new Date().toISOString().split('T')[0];
  const [historyRange, setHistoryRange] = useState({ from: todayStr, to: todayStr });
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [pendingData, setPendingData] = useState({ online_payments: [], cash_closings: [] });
  const [cashInHand, setCashInHand] = useState({});

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [closingForm, setClosingForm] = useState(EMPTY_CLOSING_FORM);
  const [savingClosing, setSavingClosing] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    loadSalesmen();
    loadCustomers();
    loadTransactions();
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  const loadSalesmen = async () => {
    try {
      const data = companyFilter
        ? (await api.get('/salesmen', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/salesmen');
      setSalesmenList(data);
    } catch (err) {
      toast.error('Failed to load salesmen.');
    }
  };

  const loadCustomers = async () => {
    try {
      const data = companyFilter
        ? (await api.get('/customers', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/customers');
      setCustomersList(data);
    } catch (err) {
      toast.error('Failed to load customers.');
    }
  };

  const loadTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const data = companyFilter
        ? (await api.get('/recovery/transactions', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/recovery/transactions');
      setTransactions(data);
    } catch (err) {
      toast.error('Failed to load transaction history.');
    } finally {
      setTransactionsLoading(false);
    }
  };

  const loadPending = async () => {
    try {
      if (companyFilter) {
        const res = await api.get('/recovery/pending-approvals', { params: { company_id: companyFilter } });
        setPendingData(res.data.data);
      } else {
        const results = await Promise.all(
          CITY_IDS.map((id) => api.get('/recovery/pending-approvals', { params: { company_id: id } }))
        );
        setPendingData({
          online_payments: results.flatMap((r) => r.data.data.online_payments || []),
          cash_closings: results.flatMap((r) => r.data.data.cash_closings || []),
        });
      }
    } catch (err) {
      toast.error('Failed to load pending approvals.');
    }
  };

  const loadCashInHand = async (salesmanId) => {
    if (!salesmanId) { setCashInHand({}); return; }
    try {
      const res = await api.get(`/recovery/cash-in-hand/${salesmanId}`);
      setCashInHand(res.data.data);
    } catch (err) {
      setCashInHand({});
    }
  };

  const handleAddRecovery = async (e) => {
    e.preventDefault();
    if (!form.salesman_id || !form.customer_id || !form.amount || Number(form.amount) <= 0) {
      toast.error('Salesman, customer and a valid amount are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/recovery/transactions', { ...form, amount: Number(form.amount) });
      toast.success(
        form.payment_type === 'cash'
          ? 'Cash payment recorded — auto-approved.'
          : 'Online payment recorded — pending approval.'
      );
      setForm({ ...EMPTY_FORM, salesman_id: form.salesman_id });
      loadCashInHand(form.salesman_id);
      loadTransactions();
      loadPending();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record recovery.');
    } finally {
      setSaving(false);
    }
  };

  const handleCashClosing = async (e) => {
    e.preventDefault();
    if (!closingForm.salesman_id || !closingForm.amount || Number(closingForm.amount) <= 0) {
      toast.error('Salesman and a valid amount are required.');
      return;
    }
    setSavingClosing(true);
    try {
      await api.post('/recovery/cash-closing', closingForm);
      toast.success('Cash closing submitted — pending admin approval.');
      setClosingForm(EMPTY_CLOSING_FORM);
      setCashInHand({});
      loadPending();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit cash closing.');
    } finally {
      setSavingClosing(false);
    }
  };

  const handleApprove = async (id, type) => {
    setApprovingId(id);
    try {
      const endpoint = type === 'payment'
        ? `/recovery/transactions/${id}/approve`
        : `/recovery/cash-closing/${id}/approve`;
      await api.patch(endpoint, {});
      toast.success('Approved.');
      loadPending();
      loadTransactions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve.');
    } finally {
      setApprovingId(null);
    }
  };

  // Reject keeps the entry (shown as rejected in History) and tells the
  // salesman; Delete removes it for good. Both are only for entries that were
  // never approved — approving is what moves money in the books.
  const handleReject = async (id, type) => {
    const reason = window.prompt('Reason for rejecting (optional) — the salesman will see it:', '');
    if (reason === null) return; // cancelled
    setApprovingId(id);
    try {
      const endpoint = type === 'payment' ? `/recovery/transactions/${id}/reject` : `/recovery/cash-closing/${id}/reject`;
      await api.patch(endpoint, { reason: reason.trim() });
      toast.success('Rejected.');
      loadPending();
      loadTransactions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeleteEntry = async (id, type) => {
    if (!window.confirm('Delete this entry permanently? This cannot be undone.')) return;
    setApprovingId(id);
    try {
      const endpoint = type === 'payment' ? `/recovery/transactions/${id}` : `/recovery/cash-closing/${id}`;
      await api.delete(endpoint);
      toast.success('Deleted.');
      loadPending();
      loadTransactions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete.');
    } finally {
      setApprovingId(null);
    }
  };

  const pendingCount = pendingData.online_payments.length + pendingData.cash_closings.length;

  // History for everyone, or for one salesman. The picker lists every salesman
  // — the salesmen list plus anyone who appears in the history itself.
  const historySalesmen = (() => {
    const byId = new Map((salesmenList || []).map((x) => [x.id, x.full_name]));
    transactions.forEach((t) => { if (t.salesman_id && !byId.has(t.salesman_id)) byId.set(t.salesman_id, t.salesmen?.full_name || 'Salesman'); });
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  })();
  const inHistoryRange = (t) => (!historyRange.from || String(t.recovery_date) >= historyRange.from) && (!historyRange.to || String(t.recovery_date) <= historyRange.to);
  const visibleTransactions = transactions.filter((t) => (!historySalesman || t.salesman_id === historySalesman) && inHistoryRange(t));
  const historySum = (rows) => rows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const historyApproved = visibleTransactions.filter((t) => t.status === 'approved');
  const historyStats = {
    count: visibleTransactions.length,
    total: historySum(historyApproved),
    cash: historySum(historyApproved.filter((t) => t.payment_type === 'cash')),
    online: historySum(historyApproved.filter((t) => t.payment_type !== 'cash')),
    pending: historySum(visibleTransactions.filter((t) => t.status === 'pending')),
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Salesman Recovery"
        subtitle="Manage cash and online payment collections"
        action={<CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              } ${t.key === 'pending' && pendingCount > 0 && tab !== t.key ? PENDING_RING : ''}`}
            >
              <Icon size={15} />
              {t.label}
              {t.key === 'pending' && pendingCount > 0 && (
                <span className={PENDING_BADGE}>{pendingCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'add' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={handleAddRecovery} className="lg:col-span-7 bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-navy text-sm">Record Payment Collection</h3>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Type *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: 'cash', label: 'Cash', desc: 'Auto-approved', icon: Banknote },
                  { v: 'online', label: 'Online', desc: 'Needs approval', icon: Smartphone },
                ].map((pt) => {
                  const Icon = pt.icon;
                  const active = form.payment_type === pt.v;
                  return (
                    <button
                      type="button"
                      key={pt.v}
                      onClick={() => setForm({ ...form, payment_type: pt.v, payment_method: pt.v === 'cash' ? 'cash' : 'easypaisa' })}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-3 text-center transition-colors ${
                        active ? 'border-navy bg-navy-chip/30' : 'border-gray-200 hover:border-navy/40'
                      }`}
                    >
                      <Icon size={18} className="text-navy" />
                      <span className="font-semibold text-navy text-sm">{pt.label}</span>
                      <span className="text-xs text-gray-400">{pt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {form.payment_type === 'online' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                  >
                    <option value="easypaisa">Easypaisa</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Reference / Transaction Number</label>
                  <input
                    type="text"
                    value={form.reference_number}
                    onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                    placeholder="e.g. TXN-123456"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Salesman *</label>
              <select
                value={form.salesman_id}
                onChange={(e) => { setForm({ ...form, salesman_id: e.target.value }); loadCashInHand(e.target.value); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select Salesman —</option>
                {salesmenList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>

            {form.salesman_id && cashInHand.cash_in_hand !== undefined && (
              <div className="bg-orange/10 border border-orange/30 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-600">Current Cash-in-Hand:</span>
                <span className="font-bold text-orange text-sm">PKR {Number(cashInHand.cash_in_hand || 0).toLocaleString()}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Customer *</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select Customer —</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}{c.shop_name ? ` — ${c.shop_name}` : ''}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Amount (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.recovery_date}
                  onChange={(e) => setForm({ ...form, recovery_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <Button type="submit" variant="accent" disabled={saving} className="w-full">
              {saving ? 'Saving...' : form.payment_type === 'cash' ? 'Record Cash Payment' : 'Submit Online Payment'}
            </Button>
          </form>

          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <h4 className="font-semibold text-emerald-800 text-sm mb-1.5">Cash Payment</h4>
              <p className="text-sm text-emerald-900/80">
                Customer hands cash directly to the salesman. The entry is approved immediately and the
                customer's balance updates right away. The cash adds to that salesman's Cash-in-Hand.
              </p>
            </div>
            <div className="bg-navy-chip/40 border border-navy-chip rounded-2xl p-5">
              <h4 className="font-semibold text-navy text-sm mb-1.5">Online Payment</h4>
              <p className="text-sm text-navy/80">
                Customer pays directly via Easypaisa/JazzCash/bank transfer. It sits pending until an admin
                verifies and approves it from the Pending Approvals tab — only then does the customer's
                balance update.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'closing' && (
        <form onSubmit={handleCashClosing} className="max-w-lg bg-white rounded-2xl shadow-card border border-gray-100 p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-navy text-sm">End of Day Cash Closing</h3>
            <p className="text-xs text-gray-400 mt-1">
              Salesman deposits everything they collected in cash. Once an admin approves it, that salesman's
              cash balance clears.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Salesman *</label>
            <select
              value={closingForm.salesman_id}
              onChange={(e) => {
                const salesmanId = e.target.value;
                setClosingForm({ ...closingForm, salesman_id: salesmanId });
                if (salesmanId) {
                  api.get(`/recovery/cash-in-hand/${salesmanId}`).then((res) => {
                    setCashInHand(res.data.data);
                    setClosingForm((prev) => ({ ...prev, salesman_id: salesmanId, amount: res.data.data.cash_in_hand || '' }));
                  }).catch(() => setCashInHand({}));
                } else {
                  setCashInHand({});
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="">— Select Salesman —</option>
              {salesmenList.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>

          {closingForm.salesman_id && cashInHand.cash_in_hand !== undefined && (
            <div className="bg-orange/10 border border-orange/30 rounded-lg px-3.5 py-2.5 space-y-1">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Total Collected:</span>
                <span className="font-semibold text-navy">PKR {Number(cashInHand.total_collected || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-600">
                <span>Previously Deposited:</span>
                <span className="font-semibold text-navy">PKR {Number(cashInHand.total_deposited || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm pt-1 border-t border-orange/20">
                <span className="font-semibold text-orange">Cash in Hand:</span>
                <span className="font-bold text-orange">PKR {Number(cashInHand.cash_in_hand || 0).toLocaleString()}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Amount to Deposit (PKR) *</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={closingForm.amount}
              onChange={(e) => setClosingForm({ ...closingForm, amount: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Deposit To</label>
            <select
              value={closingForm.deposit_to}
              onChange={(e) => setClosingForm({ ...closingForm, deposit_to: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="bank">Bank Account</option>
              <option value="petty_cash">Petty Cash / Office</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Bank / Account (optional)</label>
            <input
              type="text"
              value={closingForm.bank_account}
              onChange={(e) => setClosingForm({ ...closingForm, bank_account: e.target.value })}
              placeholder="e.g. Meezan — 0123456789"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={closingForm.notes}
              onChange={(e) => setClosingForm({ ...closingForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <Button type="submit" variant="accent" disabled={savingClosing} className="w-full">
            {savingClosing ? 'Submitting...' : 'Submit Cash Closing'}
          </Button>
        </form>
      )}

      {tab === 'pending' && (
        <div className="space-y-8">
          <div>
            <h3 className="font-semibold text-navy text-sm mb-3">Pending Online &amp; Bank Transfer Payments ({pendingData.online_payments.length})</h3>
            {pendingData.online_payments.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100">
                <EmptyState icon={Smartphone} title="No pending online or bank transfer payments" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date &amp; Time</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Method</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Ref # / Note</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Photo</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingData.online_payments.map((p, i) => (
                        <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap"><WhenCell date={p.recovery_date} createdAt={p.created_at} /></td>
                          <td className="px-6 py-3.5 font-medium text-navy">{p.salesmen?.full_name || '—'}</td>
                          <td className="px-6 py-3.5 text-gray-600">{p.users?.full_name || '—'}</td>
                          <td className="px-6 py-3.5">
                            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-navy-chip text-navy capitalize">{p.payment_method}</span>
                          </td>
                          <td className="px-6 py-3.5 text-gray-400 text-xs">{p.payment_method === 'bank_transfer' ? (p.notes || '—') : (p.reference_number || '—')}</td>
                          <td className="px-6 py-3.5"><PhotoButton url={p.photo_url} onOpen={setPhotoUrl} /></td>
                          <td className="px-6 py-3.5 text-right font-semibold text-emerald-600">PKR {Number(p.amount).toLocaleString()}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApprove(p.id, 'payment')}
                                disabled={approvingId === p.id}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {approvingId === p.id ? 'Working...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReject(p.id, 'payment')}
                                disabled={approvingId === p.id}
                                className="bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(p.id, 'payment')}
                                disabled={approvingId === p.id}
                                title="Delete this entry"
                                className="text-gray-400 hover:text-red-600 disabled:opacity-60 p-1.5 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-navy text-sm mb-3">Pending Cash Closings ({pendingData.cash_closings.length})</h3>
            {pendingData.cash_closings.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100">
                <EmptyState icon={Wallet} title="No pending cash closings" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Deposit To</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Bank</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingData.cash_closings.map((c, i) => (
                        <tr key={c.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{c.closing_date}</td>
                          <td className="px-6 py-3.5 font-medium text-navy">{c.salesmen?.full_name || '—'}</td>
                          <td className="px-6 py-3.5 text-right font-semibold text-orange">PKR {Number(c.amount).toLocaleString()}</td>
                          <td className="px-6 py-3.5 text-gray-600 capitalize">{c.deposit_to === 'bank' ? 'Bank' : 'Petty Cash'}</td>
                          <td className="px-6 py-3.5 text-gray-400 text-xs">{c.bank_account || '—'}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApprove(c.id, 'closing')}
                                disabled={approvingId === c.id}
                                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {approvingId === c.id ? 'Working...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleReject(c.id, 'closing')}
                                disabled={approvingId === c.id}
                                className="bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(c.id, 'closing')}
                                disabled={approvingId === c.id}
                                title="Delete this entry"
                                className="text-gray-400 hover:text-red-600 disabled:opacity-60 p-1.5 rounded-lg transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <DateRangeFilter
            from={historyRange.from}
            to={historyRange.to}
            defaultPreset="Today"
            onApply={(from, to) => setHistoryRange({ from, to })}
          />
          <select
            value={historySalesman}
            onChange={(e) => setHistorySalesman(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy"
          >
            <option value="">All salesmen ({historySalesmen.length})</option>
            {historySalesmen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <div className="flex gap-2 flex-wrap text-xs font-semibold">
            <span className="px-3 py-1.5 rounded-full bg-navy-chip text-navy">{historyStats.count} entries</span>
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">Collected PKR {historyStats.total.toLocaleString()}</span>
            <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">Cash {historyStats.cash.toLocaleString()} · Bank/online {historyStats.online.toLocaleString()}</span>
            {historyStats.pending > 0 && <span className="px-3 py-1.5 rounded-full bg-orange/10 text-orange">Pending PKR {historyStats.pending.toLocaleString()}</span>}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {transactionsLoading ? (
            <SkeletonTable rows={6} cols={8} />
          ) : visibleTransactions.length === 0 ? (
            <EmptyState icon={ListChecks} title="No transactions yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date &amp; Time</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Method</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Photo</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap"><WhenCell date={t.recovery_date} createdAt={t.created_at} /></td>
                      <td className="px-6 py-3.5 font-medium text-navy">{t.salesmen?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600">{t.users?.full_name || '—'}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          t.payment_type === 'cash' ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-chip text-navy'
                        }`}>
                          {t.payment_type === 'cash' ? 'Cash' : 'Online'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 text-xs capitalize">{t.payment_method}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-navy">PKR {Number(t.amount).toLocaleString()}</td>
                      <td className="px-6 py-3.5"><PhotoButton url={t.photo_url} onOpen={setPhotoUrl} /></td>
                      <td className="px-6 py-3.5 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                          t.status === 'approved' ? 'bg-emerald-50 text-emerald-700'
                            : t.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-orange/10 text-orange'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}

      {photoUrl && (
        <Modal title="Payment proof photo" onClose={() => setPhotoUrl(null)} size="lg">
          <img src={photoUrl} alt="Payment proof" className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-200 bg-gray-50" />
          <div className="pt-3 text-right">
            <a href={photoUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy hover:underline">
              Open full size
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
