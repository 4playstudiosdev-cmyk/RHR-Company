import React, { useEffect, useRef, useState } from 'react';
import { Search, ArrowRight, X } from 'lucide-react';
import {
  LayoutDashboard, MapPin, ShoppingCart, Users, HandCoins, Boxes
} from 'lucide-react';
import api from '../services/api';

// Static "jump to section" shortcuts shown when the search box is
// empty — same role as a command palette's default suggestions.
const SHORTCUTS = [
  { key: 'dashboard', label: 'Executive Dashboard & KPIs', subtitle: 'Jump to daily KPIs and executive metrics', icon: LayoutDashboard },
  { key: 'gps', label: 'Live Tracking Map', subtitle: 'Salesman and driver GPS positions', icon: MapPin },
  { key: 'orders', label: 'Sales Orders Pipeline', subtitle: 'Manage orders, dispatches & deliveries', icon: ShoppingCart },
  { key: 'customers', label: 'Customers & Ledgers', subtitle: 'Browse customer running ledgers and statements', icon: Users },
  { key: 'recovery', label: 'Salesman Recovery', subtitle: 'Collect cash/bank payments from customers', icon: HandCoins },
  { key: 'production-materials', label: 'Inventory & Raw Materials', subtitle: 'Finished goods and chemical stocks', icon: Boxes },
];

export default function GlobalSearch({ open, onClose, setPage, onViewOrderNumber, onViewLedger }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ orders: [], customers: [], products: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ orders: [], customers: [], products: [] });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ orders: [], customers: [], products: [] });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [ordersRes, customersRes, productsRes] = await Promise.all([
          api.get('/orders').catch(() => ({ data: { data: [] } })),
          api.get('/customers').catch(() => ({ data: { data: [] } })),
          api.get('/products', { params: { limit: 200 } }).catch(() => ({ data: { data: {} } })),
        ]);
        const q = query.trim().toLowerCase();
        const orders = (ordersRes.data.data || [])
          .filter((o) => o.order_number?.toLowerCase().includes(q) || o.users?.full_name?.toLowerCase().includes(q))
          .slice(0, 6);
        const customers = (customersRes.data.data || [])
          .filter((c) => c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.shop_name?.toLowerCase().includes(q))
          .slice(0, 6);
        const productList = productsRes.data.data?.products || (Array.isArray(productsRes.data.data) ? productsRes.data.data : []);
        const products = productList
          .filter((p) => p.name?.toLowerCase().includes(q))
          .slice(0, 6);
        setResults({ orders, customers, products });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (!open) return null;

  const hasResults = results.orders.length || results.customers.length || results.products.length;
  const showShortcuts = !query.trim();

  const goTo = (page, extra) => {
    if (page === 'orders' && extra) onViewOrderNumber ? onViewOrderNumber(extra) : setPage('orders');
    else if (page === 'customers' && extra) onViewLedger ? onViewLedger(extra) : setPage('customers');
    else setPage(page);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, customers, products, or jump to section... (Type or Press Esc)"
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {showShortcuts ? (
            <div className="py-2">
              {SHORTCUTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => goTo(s.key)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-navy-chip text-navy flex items-center justify-center flex-shrink-0">
                    <s.icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy">{s.label}</p>
                    <p className="text-xs text-gray-400 truncate">{s.subtitle}</p>
                  </div>
                  <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Searching…</div>
          ) : !hasResults ? (
            <div className="py-10 text-center text-sm text-gray-400">No matches for "{query}"</div>
          ) : (
            <div className="py-2">
              {results.orders.length > 0 && (
                <div className="mb-1">
                  <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Orders</p>
                  {results.orders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => goTo('orders', o.order_number)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 text-left"
                    >
                      <span className="text-sm font-medium text-navy">{o.order_number}</span>
                      <span className="text-xs text-gray-400">{o.users?.full_name} · PKR {Number(o.total_amount).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.customers.length > 0 && (
                <div className="mb-1">
                  <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Customers</p>
                  {results.customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goTo('customers', c.id)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 text-left"
                    >
                      <span className="text-sm font-medium text-navy">{c.full_name}</span>
                      <span className="text-xs text-gray-400">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.products.length > 0 && (
                <div>
                  <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Products</p>
                  {results.products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goTo('products')}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 text-left"
                    >
                      <span className="text-sm font-medium text-navy">{p.name}</span>
                      <span className="text-xs text-gray-400">PKR {p.price}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
          <span>Navigation Shortcut: <strong className="text-gray-500">Ctrl + K</strong></span>
          <span>RHR & Company Central ERP</span>
        </div>
      </div>
    </div>
  );
}
