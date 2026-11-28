import React, { useCallback, useEffect, useState } from 'react';
import { History, ShoppingCart, XCircle, CheckCircle2, CreditCard, CalendarDays, Truck, PencilLine, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import api from '../services/api';

// Order tracker — what happened, who did it, and the numbers at that moment
// (activity_log, backend sql/phase83). Pass customerId (customer ledger) or
// orderId (order details).
const META = {
  order_placed:  { icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200', label: 'Order placed' },
  order_refused: { icon: XCircle,      color: 'text-red-600 bg-red-50 border-red-200',       label: 'Order refused' },
  cart_changes:  { icon: ShoppingCart, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', label: 'Changes while making the order' },
  order_status:  { icon: Truck,        color: 'text-sky-700 bg-sky-50 border-sky-200',       label: 'Status changed' },
  order_date:    { icon: CalendarDays, color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Order date changed' },
  order_items:   { icon: PencilLine,   color: 'text-orange-700 bg-orange-50 border-orange-200', label: 'Order edited' },
  credit_limit:  { icon: CreditCard,   color: 'text-purple-700 bg-purple-50 border-purple-200', label: 'Credit limit changed' },
};

const pkr = (n) => (n == null || n === '' ? '—' : `PKR ${Math.round(Number(n)).toLocaleString('en-US')}`);
const when = (t) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
const roleLabel = (r) => ({ super_admin: 'Super admin', branch_admin: 'Branch admin', admin: 'Admin', salesman: 'Salesman', driver: 'Driver', customer: 'Customer' }[r] || r || '');

function Details({ row }) {
  const d = row.details || {};
  if (row.action === 'cart_changes') {
    const changes = d.changes || [];
    return (
      <table className="w-full text-xs mt-2">
        <thead><tr className="text-gray-400 text-left"><th className="py-1 pr-3 font-medium">Time</th><th className="py-1 pr-3 font-medium">Product</th><th className="py-1 pr-3 font-medium">Qty</th><th className="py-1 font-medium">Change</th></tr></thead>
        <tbody>
          {changes.map((c, i) => {
            const diff = Number(c.to) - Number(c.from);
            return (
              <tr key={i} className="border-t border-gray-100">
                <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{c.at ? new Date(c.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '—'}</td>
                <td className="py-1 pr-3 text-gray-700">{c.name}{c.color ? ` — ${c.color}` : ''}</td>
                <td className="py-1 pr-3 text-gray-700 whitespace-nowrap">{c.from} → {c.to}</td>
                <td className={`py-1 font-semibold whitespace-nowrap ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Number(c.to) === 0 ? `removed ${c.from}` : diff > 0 ? `+${diff}` : `${diff}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
  if (row.action === 'order_placed' || row.action === 'order_refused') {
    return (
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div><p className="text-gray-400">Order total</p><p className="font-semibold text-gray-800">{pkr(d.total)}</p></div>
          <div><p className="text-gray-400">Outstanding then</p><p className="font-semibold text-gray-800">{pkr(d.balance_before)}</p></div>
          <div><p className="text-gray-400">Credit limit then</p><p className="font-semibold text-gray-800">{d.credit_limit ? pkr(d.credit_limit) : 'no limit'}</p></div>
          <div><p className="text-gray-400">Room left then</p><p className="font-semibold text-gray-800">{d.room_left == null ? '—' : pkr(d.room_left)}</p></div>
        </div>
        {(d.items || []).length > 0 && (
          <table className="w-full text-xs">
            <thead><tr className="text-gray-400 text-left"><th className="py-1 pr-3 font-medium">Item</th><th className="py-1 pr-3 font-medium">Qty</th><th className="py-1 pr-3 font-medium">Rate</th><th className="py-1 font-medium">Amount</th></tr></thead>
            <tbody>
              {d.items.map((it, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1 pr-3 text-gray-700">{it.name}</td>
                  <td className="py-1 pr-3">{it.quantity}</td>
                  <td className="py-1 pr-3">{it.unit_price != null ? pkr(it.unit_price) : '—'}</td>
                  <td className="py-1">{it.subtotal != null ? pkr(it.subtotal) : it.unit_price != null ? pkr(it.unit_price * it.quantity) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.reason && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">Reason: {d.reason}</p>}
        <p className="text-[11px] text-gray-400">From the {d.source === 'app' ? 'mobile app' : 'admin web'}</p>
      </div>
    );
  }
  if (row.action === 'order_items') {
    return (
      <ul className="mt-2 text-xs space-y-0.5">
        {(d.changes || []).map((c, i) => (
          <li key={i} className="text-gray-700">
            {c.name}: {c.from} → {c.to}{' '}
            <span className={c.change > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
              ({c.to === 0 ? 'removed' : c.change > 0 ? `+${c.change}` : c.change})
            </span>
          </li>
        ))}
        <li className="text-gray-500">Total: {pkr(d.total_from)} → {pkr(d.total_to)}</li>
      </ul>
    );
  }
  return null;
}

export default function ActivityLog({ customerId, orderId, title = 'Activity' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    if (!customerId && !orderId) return;
    setLoading(true);
    try {
      const res = await api.get('/activity', { params: orderId ? { order_id: orderId } : { customer_id: customerId } });
      setRows(res.data?.data || []);
      setNote(res.data?.message && /not set up/i.test(res.data.message) ? res.data.message : '');
    } catch (_) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, orderId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <h2 className="font-semibold text-navy flex items-center gap-2"><History size={16} /> {title}</h2>
        <button onClick={load} className="text-xs text-gray-500 hover:text-navy flex items-center gap-1"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {note && <p className="px-6 py-3 text-xs text-amber-700 bg-amber-50">{note}</p>}
      {!loading && rows.length === 0 && !note && (
        <p className="px-6 py-6 text-sm text-gray-400">Nothing recorded yet. Order attempts, changes while making an order, status / date changes and credit-limit changes appear here from now on.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const m = META[r.action] || { icon: History, color: 'text-gray-600 bg-gray-50 border-gray-200', label: r.action };
          const Icon = m.icon;
          const hasDetails = ['cart_changes', 'order_placed', 'order_refused', 'order_items'].includes(r.action);
          const isOpen = !!open[r.id];
          return (
            <li key={r.id} className="px-6 py-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${m.color}`}><Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-gray-800">{m.label}</span>
                    <span className="text-xs text-gray-400">{when(r.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 break-words">{r.summary}</p>
                  <p className="text-xs text-gray-400">by {r.actor_name || 'unknown'}{r.actor_role ? ` · ${roleLabel(r.actor_role)}` : ''}</p>
                  {hasDetails && (
                    <button onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} className="mt-1 text-xs text-navy font-medium flex items-center gap-1">
                      {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {isOpen ? 'Hide details' : 'Show details'}
                    </button>
                  )}
                  {hasDetails && isOpen && <Details row={r} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
