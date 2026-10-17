import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, HandCoins, ReceiptText, Landmark, TrendingUp, TrendingDown, UserPlus,
  Flame, Trophy, Package, Calendar as CalendarIcon, Clock, Truck, Check, Trash2,
  ChevronLeft, ChevronRight, ArrowRight, AlertTriangle, Layers, Repeat
} from 'lucide-react';
import api from '../../services/api';
import EmptyState from '../EmptyState';

// Widgets for the main admin Dashboard, in the same light navy/orange card
// style as the rest of the app. Each one loads its own data from
// /dashboard/* (see RHR-backend/src/routes/dashboard.routes.js) so a slow
// or failing widget never blanks the others. `companyId` is null for "All
// cities" (super_admin) — branch admins are always scoped by the server.

// The admin's own calendar day (not UTC) — sent as ?today= so "today" means
// what it means on their wall clock.
const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const pkr = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const num = (n) => Number(n || 0).toLocaleString();

const initials = (name) => {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
};

function useDash(path, params, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const key = JSON.stringify(params) + deps;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api.get(`/dashboard/${path}`, { params: { today: localISO(), ...params } })
      .then((res) => alive && setState({ data: res.data.data, loading: false, error: '' }))
      .catch((err) => alive && setState({ data: null, loading: false, error: err.response?.data?.message || 'Failed to load.' }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return state;
}

const scope = (companyId) => (companyId ? { company_id: companyId } : {});

function Card({ title, icon: Icon, right, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col ${className}`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <span className="w-8 h-8 rounded-lg bg-navy-chip text-navy flex items-center justify-center flex-shrink-0">
              <Icon size={16} />
            </span>
          )}
          <h3 className="font-semibold text-navy truncate">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Loading({ rows = 4 }) {
  return (
    <div className="p-5 space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg" />)}
    </div>
  );
}

function ErrorNote({ message }) {
  return <div className="m-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{message}</div>;
}

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
];

function PeriodSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-navy bg-white focus:outline-none focus:ring-2 focus:ring-navy-chip"
    >
      {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  );
}

// ── Today at a glance ─────────────────────────────────────────────────────
function Kpi({ label, value, sub, subTone = 'text-gray-400', icon: Icon, tone }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon size={16} /></span>
      </div>
      <p className="text-2xl font-bold text-navy leading-tight mt-2 truncate">{value}</p>
      <p className={`text-xs mt-1 truncate ${subTone}`}>{sub}</p>
    </div>
  );
}

export function TodayKpis({ companyId }) {
  const { data, loading, error } = useDash('summary', scope(companyId), '');
  if (loading) return <div className="grid grid-cols-2 xl:grid-cols-6 gap-4"><Loading rows={1} /><Loading rows={1} /><Loading rows={1} /></div>;
  if (error) return <ErrorNote message={error} />;
  const up = data.sales_change_pct != null && data.sales_change_pct >= 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
      <Kpi label="Today's Sales" value={pkr(data.sales_today)} sub={`${data.orders_today} order${data.orders_today === 1 ? '' : 's'} today`} subTone="text-emerald-600" icon={ShoppingCart} tone="bg-navy-chip text-navy" />
      <Kpi label="Today's Recovery" value={pkr(data.recovery_today)} sub={`Expense: ${pkr(data.expense_today)}`} icon={HandCoins} tone="bg-emerald-50 text-emerald-600" />
      <Kpi label="Outstanding (Dealers)" value={pkr(data.outstanding)} sub={`${data.pending_orders} order${data.pending_orders === 1 ? '' : 's'} pending`} icon={ReceiptText} tone="bg-orange/10 text-orange" />
      <Kpi label="Bank + Cash" value={pkr(data.bank_cash)} sub={`Cash ${pkr(data.cash)} · Bank ${pkr(data.bank)}`} icon={Landmark} tone="bg-navy-chip text-navy" />
      <Kpi
        label="New Sales"
        value={pkr(data.sales_this_month)}
        sub={data.sales_change_pct == null ? 'This month · no sales last month' : `${up ? '▲' : '▼'} ${Math.abs(data.sales_change_pct)}% vs last month`}
        subTone={data.sales_change_pct == null ? 'text-gray-400' : up ? 'text-emerald-600' : 'text-red-600'}
        icon={up || data.sales_change_pct == null ? TrendingUp : TrendingDown}
        tone="bg-emerald-50 text-emerald-600"
      />
      <Kpi label="New Clients" value={num(data.new_clients)} sub="New dealers this month" icon={UserPlus} tone="bg-orange/10 text-orange" />
    </div>
  );
}

// ── Most selling products ─────────────────────────────────────────────────
const MEDALS = [
  { label: 'Gold', ring: '#f5b301', badge: 'bg-yellow-400 text-yellow-900' },
  { label: 'Silver', ring: '#9ca3af', badge: 'bg-gray-300 text-gray-800' },
  { label: 'Platinum', ring: '#6d7cff', badge: 'bg-indigo-300 text-indigo-900' },
];

function Ring({ pct, color, children }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef0f6" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, Math.min(1, pct)))} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function ProductImage({ src, size = 'w-12 h-12' }) {
  const [broken, setBroken] = useState(false);
  return src && !broken ? (
    <img src={src} alt="" onError={() => setBroken(true)} className={`${size} object-contain rounded-lg bg-gray-50`} />
  ) : (
    <div className={`${size} rounded-lg bg-gray-50 text-gray-300 flex items-center justify-center`}><Package size={20} /></div>
  );
}

export function MostSellingProducts({ companyId }) {
  const [period, setPeriod] = useState('month');
  const { data, loading, error } = useDash('top-products', { ...scope(companyId), period }, '');
  const list = data?.products || [];
  const top = list[0]?.qty || 1;
  return (
    <Card title="Most Selling Products" icon={Flame} right={<PeriodSelect value={period} onChange={setPeriod} />}>
      {loading ? <Loading /> : error ? <ErrorNote message={error} /> : list.length === 0 ? (
        <EmptyState icon={Package} title="No sales in this period" subtitle="Products sold will rank here" />
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-3 gap-4">
            {list.slice(0, 3).map((p, i) => (
              <div key={p.name} className="text-center min-w-0">
                <div className="relative">
                  <Ring pct={p.qty / top} color={MEDALS[i].ring}>
                    <ProductImage src={p.image_url} size="w-14 h-14" />
                    <span className="text-lg font-bold text-navy leading-tight mt-0.5">{num(p.qty)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 -mt-0.5">{p.unit}s sold</span>
                  </Ring>
                  <span className={`absolute top-0 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full shadow ${MEDALS[i].badge}`}>
                    {i + 1} · {MEDALS[i].label}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-navy truncate" title={p.name}>{p.name}</p>
                <p className="text-xs text-gray-400">{pkr(p.revenue)} · {p.orders} order{p.orders === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
          {list.length > 3 && (
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
              {list.slice(3).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="w-5 text-sm font-bold text-gray-300 text-center">{i + 4}</span>
                  <ProductImage src={p.image_url} size="w-9 h-9" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy truncate">{p.name}</p>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.max(4, (p.qty / top) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-gray-500 whitespace-nowrap">{num(p.qty)} {p.unit}s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Top clients ───────────────────────────────────────────────────────────
const RANK_BADGE = ['bg-yellow-400 text-yellow-900', 'bg-gray-300 text-gray-800', 'bg-indigo-300 text-indigo-900'];

export function TopClients({ companyId, onViewLedger }) {
  const [period, setPeriod] = useState('month');
  const [sort, setSort] = useState('sales');
  const { data, loading, error } = useDash('top-clients', { ...scope(companyId), period, sort }, '');
  const rows = data?.clients || [];
  const max = Math.max(...rows.map((r) => r[sort] || 0), 1);
  return (
    <Card
      title="Top Clients"
      icon={Trophy}
      right={
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-navy bg-white focus:outline-none focus:ring-2 focus:ring-navy-chip"
          >
            <option value="sales">Sort: Sales</option>
            <option value="recovery">Sort: Recovery</option>
            <option value="outstanding">Sort: Outstanding</option>
          </select>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
      }
    >
      {loading ? <Loading rows={5} /> : error ? <ErrorNote message={error} /> : rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No client activity in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Rank</th>
                <th className="px-3 py-3 font-semibold text-xs uppercase tracking-wide">Client</th>
                <th className="px-3 py-3 font-semibold text-xs uppercase tracking-wide text-right">Orders</th>
                <th className="px-3 py-3 font-semibold text-xs uppercase tracking-wide text-right">Total Sale</th>
                <th className="px-3 py-3 font-semibold text-xs uppercase tracking-wide text-right">Recovery</th>
                <th className="px-3 py-3 font-semibold text-xs uppercase tracking-wide text-right">Outstanding</th>
                <th className="px-5 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => onViewLedger?.(c.id)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80 cursor-pointer"
                  title="Open ledger"
                >
                  <td className="px-5 py-3">
                    {i < 3
                      ? <span className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold ${RANK_BADGE[i]}`}>{i + 1}</span>
                      : <span className="inline-flex w-7 h-7 items-center justify-center text-sm font-bold text-gray-300">{i + 1}</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-navy-chip text-navy flex items-center justify-center text-xs font-bold flex-shrink-0">{initials(c.name)}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-navy truncate">{c.name}</p>
                        <p className="text-xs text-gray-400 truncate">{[c.contact, c.place].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600">{c.orders}</td>
                  <td className="px-3 py-3 text-right font-semibold text-navy whitespace-nowrap">{pkr(c.sales)}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 whitespace-nowrap">{pkr(c.recovery)}</td>
                  <td className="px-3 py-3 text-right text-red-500 whitespace-nowrap">{pkr(c.outstanding)}{c.outstanding > 0 ? ' Dr' : ''}</td>
                  <td className="px-5 py-3">
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.max(3, ((c[sort] || 0) / max) * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Orders vs stock ───────────────────────────────────────────────────────
export function OrdersVsStock({ companyId, setPage }) {
  const { data, loading, error } = useDash('orders-vs-stock', scope(companyId), '');
  const rows = data?.products || [];
  return (
    <Card
      title="Orders vs Stock"
      icon={Layers}
      right={
        <button onClick={() => setPage?.('products')} className="text-navy text-xs font-medium hover:underline flex items-center gap-1">
          Inventory <ArrowRight size={13} />
        </button>
      }
    >
      {loading ? <Loading rows={5} /> : error ? <ErrorNote message={error} /> : (
        <>
          <div className="px-5 pt-4 flex gap-2 flex-wrap text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 bg-navy-chip/60 text-navy rounded-full px-3 py-1">
              <ShoppingCart size={12} /> {num(data.total_ordered)} on open orders
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${data.short_count ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
              <AlertTriangle size={12} /> {data.short_count} product{data.short_count === 1 ? '' : 's'} short on stock
            </span>
          </div>
          <div className="p-5 pt-3 space-y-3 max-h-[420px] overflow-y-auto">
            {rows.map((r) => {
              const pct = r.status === 'none' ? 100 : Math.min(100, Math.round((r.stock / Math.max(r.ordered, 1)) * 100));
              return (
                <div key={r.name} className="flex items-start gap-3">
                  <ProductImage src={r.image_url} size="w-10 h-10" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy truncate">{r.name}</p>
                      {r.status === 'short' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap">Short {num(r.short_by)}</span>}
                      {r.status === 'ok' && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">OK · {num(r.left)} left</span>}
                      {r.status === 'none' && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">No open order</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="flex gap-1">
                        {r.parts.map((q, i) => <span key={i} className="text-[10px] font-mono bg-orange/10 text-orange rounded px-1.5 py-0.5">{num(q)}</span>)}
                      </div>
                      <p className="text-xs text-gray-500 whitespace-nowrap">Order <b className="text-navy">{num(r.ordered)}</b> · Stock <b className="text-navy">{num(r.stock)}</b></p>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div className={`${r.status === 'short' ? 'bg-red-500' : 'bg-emerald-500'} h-full rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Week calendar ─────────────────────────────────────────────────────────
const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekCalendar({ companyId }) {
  const today = localISO();
  const [center, setCenter] = useState(today);
  const [selected, setSelected] = useState(today);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(center, i - 3)), [center]);
  const { data, loading, error } = useDash('calendar', { ...scope(companyId), from: days[0], to: days[6] }, '');
  const events = data?.events || [];
  const dayEvents = events.filter((e) => e.date === selected);
  const hasEvents = new Set(events.map((e) => e.date));
  const monthLabel = new Date(`${center}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const shift = (n) => { setCenter((c) => addDaysISO(c, n)); };

  return (
    <Card title="Calendar" icon={CalendarIcon} right={<span className="text-xs text-gray-400">{monthLabel}</span>}>
      <div className="p-4">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-7)} className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100" aria-label="Previous week"><ChevronLeft size={16} /></button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const dt = new Date(`${d}T12:00:00`);
              const active = d === selected;
              return (
                <button
                  key={d}
                  onClick={() => setSelected(d)}
                  className={`flex flex-col items-center py-2 rounded-xl transition-colors ${active ? 'bg-navy text-white' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                  <span className={`text-[10px] ${active ? 'text-white/70' : 'text-gray-400'}`}>{DOW[dt.getDay()]}</span>
                  <span className="text-base font-bold leading-tight">{dt.getDate()}</span>
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${hasEvents.has(d) ? (active ? 'bg-white' : 'bg-emerald-500') : 'bg-transparent'}`} />
                </button>
              );
            })}
          </div>
          <button onClick={() => shift(7)} className="p-1.5 rounded-lg text-gray-400 hover:text-navy hover:bg-gray-100" aria-label="Next week"><ChevronRight size={16} /></button>
        </div>

        <div className="mt-4 space-y-2 max-h-[260px] overflow-y-auto">
          {loading ? <Loading rows={2} /> : error ? <ErrorNote message={error} /> : dayEvents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nothing recorded on {selected === today ? 'today' : selected}</p>
          ) : dayEvents.map((e) => (
            <div key={e.id} className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 border ${e.type === 'delivered' ? 'bg-emerald-50/60 border-emerald-100' : 'bg-navy-chip/30 border-navy-chip'}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${e.type === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-navy-chip text-navy'}`}>
                {e.type === 'delivered' ? <Truck size={15} /> : <HandCoins size={15} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy truncate">{e.title}</p>
                <p className="text-xs text-gray-500 truncate">{e.type === 'delivered' ? `${e.subtitle} · ${pkr(e.amount)}` : e.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Reminders ─────────────────────────────────────────────────────────────
// Dealers who still owe money. Done / delete hides one on this browser; it
// comes back if that dealer's balance changes.
const storeKey = 'rhr_dashboard_dismissed_reminders';
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; } };

export function Reminders({ companyId, onViewLedger }) {
  const { data, loading, error } = useDash('reminders', scope(companyId), '');
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = useCallback((r) => {
    setDismissed((prev) => {
      const next = { ...prev, [r.id]: r.amount };
      try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage unavailable — hides until reload */ }
      return next;
    });
  }, []);
  const active = (data?.reminders || []).filter((r) => dismissed[r.id] !== r.amount);

  return (
    <Card title="Reminders" icon={Clock} right={<span className="text-xs text-gray-400">{active.length} active</span>}>
      {loading ? <Loading rows={3} /> : error ? <ErrorNote message={error} /> : active.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No recoveries due 🎉</p>
      ) : (
        <ul className="p-3 space-y-1 max-h-[260px] overflow-y-auto">
          {active.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-gray-50 group">
              <HandCoins size={15} className="text-emerald-600 flex-shrink-0" />
              <button onClick={() => onViewLedger?.(r.id)} className="flex-1 min-w-0 text-left" title="Open ledger">
                <p className="text-sm text-gray-700 truncate">Recovery due: <b className="text-navy">{r.name}</b> — {pkr(r.amount)} outstanding</p>
              </button>
              <button onClick={() => dismiss(r)} title="Delete" className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              <button onClick={() => dismiss(r)} title="Mark done" className="p-1.5 text-gray-300 hover:text-emerald-600"><Check size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Recent recoveries ─────────────────────────────────────────────────────
export function RecentRecoveries({ companyId, setPage }) {
  const { data, loading, error } = useDash('summary', scope(companyId), '');
  const rows = data?.recent_recoveries || [];
  return (
    <Card
      title="Recent Recoveries"
      icon={Repeat}
      right={
        <button onClick={() => setPage?.('recovery')} className="text-navy text-xs font-medium hover:underline flex items-center gap-1">
          View All <ArrowRight size={13} />
        </button>
      }
    >
      {loading ? <Loading rows={4} /> : error ? <ErrorNote message={error} /> : rows.length === 0 ? (
        <EmptyState icon={HandCoins} title="No recoveries yet" subtitle="Approved recoveries will show up here" />
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-9 h-9 rounded-full bg-navy-chip text-navy flex items-center justify-center text-xs font-bold flex-shrink-0">{initials(r.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy truncate">{r.name}</p>
                <p className="text-xs text-gray-400 capitalize">{r.date} · {r.method}</p>
              </div>
              <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">+{num(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
