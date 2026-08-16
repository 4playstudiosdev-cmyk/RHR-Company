import React, { useEffect, useRef, useState } from 'react';
import { Users, UserCheck, BookOpen, Search, Phone, Mail, AlertTriangle, User } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 10;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB');
}

function filterCustomers(list, term) {
  if (!term.trim()) return list;
  const q = term.trim().toLowerCase();
  return list.filter(
    (c) =>
      c.full_name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.shop_name?.toLowerCase().includes(q)
  );
}

export default function Customers({ onViewLedger }) {
  const toast = useToast();
  const pendingRef = useRef(null);
  const allRef = useRef(null);
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Outstanding balance per customer — fetched lazily, only for the rows
  // actually visible on the current page (avoids an N+1 ledger call for
  // every customer in the company on every page load).
  const [outstandingMap, setOutstandingMap] = useState({});
  const [outstandingLoading, setOutstandingLoading] = useState({});

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      const [pendingRes, allRes, ordersRes] = await Promise.all([
        api.get('/customers/pending'),
        api.get('/customers'),
        api.get('/orders')
      ]);
      setPending(pendingRes.data.data || []);
      setAll(allRes.data.data || []);

      const counts = {};
      (ordersRes.data.data || []).forEach((o) => {
        if (o.customer_id) counts[o.customer_id] = (counts[o.customer_id] || 0) + 1;
      });
      setOrdersByCustomer(counts);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (customer) => {
    if (!window.confirm(`Approve "${customer.full_name}"?`)) return;
    setApprovingId(customer.id);
    try {
      await api.patch(`/auth/approve-customer/${customer.id}`);
      setPending((prev) => prev.filter((c) => c.id !== customer.id));
      toast.success(`${customer.full_name} approved.`);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve customer.');
    } finally {
      setApprovingId(null);
    }
  };

  const filtered = filterCustomers(all, search);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCustomers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Lazy-load outstanding balances for whichever customers are on screen.
  useEffect(() => {
    const toFetch = pageCustomers.filter(
      (c) => !(c.id in outstandingMap) && !outstandingLoading[c.id]
    );
    if (toFetch.length === 0) return;

    setOutstandingLoading((prev) => {
      const next = { ...prev };
      toFetch.forEach((c) => { next[c.id] = true; });
      return next;
    });

    Promise.all(
      toFetch.map((c) =>
        api
          .get(`/ledger/${c.id}`)
          .then((res) => ({ id: c.id, balance: res.data.data.currentBalance || 0 }))
          .catch(() => ({ id: c.id, balance: null }))
      )
    ).then((results) => {
      setOutstandingMap((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.balance; });
        return next;
      });
      setOutstandingLoading((prev) => {
        const next = { ...prev };
        toFetch.forEach((c) => { delete next[c.id]; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, all]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Customers Management</h1>
        <p className="text-sm text-gray-500 mt-1">Review pending approvals and manage your customer database.</p>
      </div>

      {/* Both sections are always visible below — these just jump-scroll to them */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <button
          onClick={() => scrollTo(pendingRef)}
          className="pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 -mb-px border-b-2 text-navy border-navy hover:border-navy"
        >
          Pending Approval
          {pending.length > 0 && (
            <span className="bg-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
          )}
        </button>
        <button
          onClick={() => scrollTo(allRef)}
          className="pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 -mb-px border-b-2 text-gray-400 border-transparent hover:text-navy"
        >
          All Customers
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <section ref={pendingRef} className="mb-8 scroll-mt-6">
          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={UserCheck} title="No customers awaiting approval" subtitle="New signups will show up here" />
            </div>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle size={20} className="text-orange mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-navy text-sm">
                    Action Required: {pending.length} Pending Customer Application{pending.length > 1 ? 's' : ''}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    These applications require review before customers can start placing orders.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {pending.map((customer) => (
                  <div key={customer.id} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-navy-chip text-navy flex items-center justify-center font-bold flex-shrink-0">
                        {getInitials(customer.full_name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-navy truncate">{customer.shop_name || customer.full_name}</h4>
                        <p className="text-xs text-gray-400">Requested: {timeAgo(customer.created_at)}</p>
                      </div>
                    </div>
                    <div className="space-y-2 mb-5 flex-1">
                      {customer.shop_name && (
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <User size={15} className="text-gray-400" />
                          <span>Contact: {customer.full_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Phone size={15} className="text-gray-400" />
                        <span>{customer.phone}</span>
                      </div>
                      {customer.email && (
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <Mail size={15} className="text-gray-400" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="accent"
                      className="w-full"
                      onClick={() => handleApprove(customer)}
                      disabled={approvingId === customer.id}
                    >
                      {approvingId === customer.id ? 'Approving...' : 'Approve'}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {!loading && (
        <section ref={allRef} className="scroll-mt-6">
          <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
            <h3 className="font-semibold text-navy">Active Customer Database</h3>
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email..."
                className="w-full bg-white border border-gray-200 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-all shadow-sm"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={Users} title="No customers found" subtitle={search ? 'Try a different search' : undefined} />
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                      <th className="py-3 px-6 font-semibold text-xs uppercase tracking-wide">Customer</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Phone</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-right">Orders</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-right">Outstanding</th>
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide text-center">Status</th>
                      <th className="py-3 px-6 font-semibold text-xs uppercase tracking-wide text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageCustomers.map((customer, i) => {
                      const balance = outstandingMap[customer.id];
                      return (
                        <tr
                          key={customer.id}
                          className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                            i % 2 === 1 ? 'bg-gray-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-navy-chip text-navy flex items-center justify-center font-semibold flex-shrink-0">
                                {getInitials(customer.full_name)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-navy truncate">{customer.full_name}</div>
                                <div className="text-xs text-gray-400 truncate">
                                  {customer.shop_name || customer.email || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{customer.phone}</td>
                          <td className="py-3 px-4 text-right text-navy font-medium">
                            {ordersByCustomer[customer.id] || 0}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {balance === undefined ? (
                              <span className="text-gray-300 text-xs">loading…</span>
                            ) : balance === null ? (
                              <span className="text-gray-300 text-xs">—</span>
                            ) : balance > 0 ? (
                              <span className="text-red-600">PKR {Number(balance).toLocaleString()}</span>
                            ) : (
                              <span className="text-gray-400">PKR 0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                customer.is_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {customer.is_approved ? 'Approved' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-right">
                            {onViewLedger && (
                              <button
                                onClick={() => onViewLedger(customer.id)}
                                className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                              >
                                <BookOpen size={13} /> View Ledger
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-wrap gap-3">
                <span className="text-xs text-gray-400">
                  Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
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
                        page === i + 1 ? 'bg-navy text-white border-navy' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
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
            </div>
          )}
        </section>
      )}
    </div>
  );
}

