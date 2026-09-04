import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, Send, PackageCheck } from 'lucide-react';
import api, { getCurrentUser, getTransfers, getPendingTransfers, createTransfer, receiveTransfer } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_SEND_FORM = { to_company_id: '', product_id: '', quantity: '', notes: '' };

export default function StockTransfers() {
  const toast = useToast();
  const user = getCurrentUser();

  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receivingId, setReceivingId] = useState(null);
  const [sendForm, setSendForm] = useState(EMPTY_SEND_FORM);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
    loadCompanies();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingRes, historyRes] = await Promise.all([getPendingTransfers(), getTransfers()]);
      setPending(pendingRes.data.data || []);
      setHistory(historyRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load transfers.');
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const res = await api.get('/companies');
      setCompanies((res.data.data || []).filter((c) => c.id !== user?.companyId));
    } catch (err) {
      toast.error('Failed to load branches.');
    }
  };

  const loadProducts = async () => {
    try {
      const res = await api.get('/products', { params: { limit: 500 } });
      setProducts(res.data.data?.products || []);
    } catch (err) {
      toast.error('Failed to load products.');
    }
  };

  const handleReceive = async (transfer) => {
    if (!window.confirm(
      `Confirm receipt of ${transfer.quantity} ${transfer.products?.unit || ''} of ${transfer.products?.name} from ${transfer.from_company?.name}?`
    )) return;

    setReceivingId(transfer.id);
    try {
      const r = await receiveTransfer(transfer.id);
      if (r.data.success) {
        toast.success('Stock received — inventory updated.');
        loadData();
      } else {
        toast.error(r.data.message || 'Failed to receive transfer.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to receive transfer.');
    } finally {
      setReceivingId(null);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!sendForm.to_company_id || !sendForm.product_id || !sendForm.quantity) {
      toast.error('To Branch, Product, and Quantity are all required.');
      return;
    }

    const toBranchName = companies.find((c) => c.id === sendForm.to_company_id)?.name || 'destination branch';
    if (!window.confirm(
      `Send ${sendForm.quantity} units to ${toBranchName}?\nStock will be deducted from your inventory immediately.`
    )) return;

    setSending(true);
    try {
      const r = await createTransfer({
        to_company_id: sendForm.to_company_id,
        product_id: sendForm.product_id,
        quantity: Number(sendForm.quantity),
        notes: sendForm.notes
      });
      if (r.data.success) {
        toast.success('Stock sent successfully.');
        setSendForm(EMPTY_SEND_FORM);
        loadData();
        loadProducts();
      } else {
        toast.error(r.data.message || 'Failed to send stock.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send stock.');
    } finally {
      setSending(false);
    }
  };

  const transferType = (t) => (t.from_company_id === user?.companyId ? 'Sent' : 'Received');

  return (
    <div className="p-6">
      <PageHeader
        title="Stock Transfers"
        subtitle="Send and receive finished product stock between branches"
      />

      {/* ── PENDING TRANSFERS (incoming) ── */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-navy mb-3">Pending Transfers</h2>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {loading ? (
            <SkeletonTable rows={3} cols={5} />
          ) : pending.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No pending transfers" subtitle="Stock sent to your branch will show up here awaiting receipt" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">From Branch</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Quantity</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-700">{t.from_company?.name} <span className="text-gray-400">({t.from_company?.city})</span></td>
                      <td className="px-6 py-3.5 font-medium text-navy">{t.products?.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{t.quantity} {t.products?.unit}</td>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => handleReceive(t)}
                          disabled={receivingId === t.id}
                          className="flex items-center gap-1.5 bg-[#1A7A4A] hover:bg-[#1A7A4A]/90 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                        >
                          <PackageCheck size={14} />
                          {receivingId === t.id ? 'Receiving...' : 'Receive Stock'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── SEND STOCK ── */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-navy mb-3">Send Stock</h2>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 max-w-2xl">
          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">To Branch *</label>
                <select
                  value={sendForm.to_company_id}
                  onChange={(e) => setSendForm({ ...sendForm, to_company_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  <option value="">Select branch...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={sendForm.quantity}
                  onChange={(e) => setSendForm({ ...sendForm, quantity: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Product *</label>
              <select
                value={sendForm.product_id}
                onChange={(e) => setSendForm({ ...sendForm, product_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">Select product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_quantity} {p.unit})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={sendForm.notes}
                onChange={(e) => setSendForm({ ...sendForm, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2"
            >
              <Send size={15} /> {sending ? 'Sending...' : 'Send Stock'}
            </Button>
          </form>
        </div>
      </div>

      {/* ── TRANSFER HISTORY ── */}
      <div>
        <h2 className="text-base font-bold text-navy mb-3">Transfer History</h2>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {loading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : history.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No transfers yet" subtitle="Sent and received transfers will show up here" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">From</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">To</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Qty</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5 text-gray-600">{t.from_company?.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{t.to_company?.name}</td>
                      <td className="px-6 py-3.5 font-medium text-navy">{t.products?.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{t.quantity} {t.products?.unit}</td>
                      <td className="px-6 py-3.5">
                        {t.status === 'dispatched' ? (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-orange/10 text-orange">In Transit</span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">Received</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-gray-500">{transferType(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
