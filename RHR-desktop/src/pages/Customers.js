import React, { useEffect, useRef, useState } from 'react';
import { Users, UserCheck, BookOpen, Search, Phone, Mail, AlertTriangle, User, Tag, DollarSign, RotateCcw } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const RATE_TIERS = [
  { value: 'manual', label: 'Standard Rate', desc: 'Original price' },
  { value: 'discount', label: 'Discount Rate', desc: 'Price − PKR 10' },
  { value: 'premium', label: 'Premium Rate', desc: 'Price + PKR 10' }
];

const RATE_BADGE = {
  manual:   { label: 'Standard', classes: 'bg-navy-chip text-navy' },
  discount: { label: 'Discount', classes: 'bg-emerald-50 text-emerald-700' },
  premium:  { label: 'Premium',  classes: 'bg-orange/10 text-orange' }
};

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
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const pendingRef = useRef(null);
  const allRef = useRef(null);
  const [pending, setPending] = useState([]);
  const [all, setAll] = useState([]);
  const [ordersByCustomer, setOrdersByCustomer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [approvingCustomer, setApprovingCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Outstanding balance per customer — fetched lazily, only for the rows
  // actually visible on the current page (avoids an N+1 ledger call for
  // every customer in the company on every page load).
  const [outstandingMap, setOutstandingMap] = useState({});
  const [outstandingLoading, setOutstandingLoading] = useState({});

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadCustomers = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { company_id: companyFilter };
      const [pendingData, allData, ordersData] = companyFilter
        ? await Promise.all([
            api.get('/customers/pending', { params }).then((r) => r.data.data || []),
            api.get('/customers', { params }).then((r) => r.data.data || []),
            api.get('/orders', { params }).then((r) => r.data.data || [])
          ])
        : await Promise.all([
            fetchAllCities('/customers/pending'),
            fetchAllCities('/customers'),
            fetchAllCities('/orders')
          ]);
      setPending(pendingData);
      setAll(allData);

      const counts = {};
      ordersData.forEach((o) => {
        if (o.customer_id) counts[o.customer_id] = (counts[o.customer_id] || 0) + 1;
      });
      setOrdersByCustomer(counts);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (customer) => {
    setApprovingCustomer(customer);
  };

  const confirmApprove = async (rateTier) => {
    const customer = approvingCustomer;
    setApprovingId(customer.id);
    try {
      await api.patch(`/auth/approve-customer/${customer.id}`, { rate_tier: rateTier });
      setPending((prev) => prev.filter((c) => c.id !== customer.id));
      toast.success(`${customer.full_name} approved.`);
      loadCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve customer.');
    } finally {
      setApprovingId(null);
      setApprovingCustomer(null);
    }
  };

  const handleChangeRateTier = async (customer, rateTier) => {
    if (rateTier === (customer.rate_tier || 'manual')) return;
    try {
      await api.patch(`/customers/${customer.id}/rate-tier`, { rate_tier: rateTier });
      setAll((prev) => prev.map((c) => (c.id === customer.id ? { ...c, rate_tier: rateTier } : c)));
      toast.success(`${customer.full_name}'s rate tier updated.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update rate tier.');
    }
  };

  const [pricingCustomer, setPricingCustomer] = useState(null);
  const [pricingRows, setPricingRows] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSearch, setPricingSearch] = useState('');
  const [priceInputs, setPriceInputs] = useState({});
  const [savingProductId, setSavingProductId] = useState(null);

  const openPricingModal = async (customer) => {
    setPricingCustomer(customer);
    setPricingSearch('');
    setPricingLoading(true);
    try {
      const res = await api.get(`/customers/${customer.id}/pricing`);
      const rows = res.data.data || [];
      setPricingRows(rows);
      setPriceInputs(Object.fromEntries(rows.map((r) => [r.product_id, r.custom_price ?? ''])));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load pricing.');
      setPricingRows([]);
    } finally {
      setPricingLoading(false);
    }
  };

  const handleSaveCustomPrice = async (productId) => {
    const raw = priceInputs[productId];
    if (raw === '' || raw === null || raw === undefined || Number(raw) < 0) {
      toast.error('Enter a valid price.');
      return;
    }
    setSavingProductId(productId);
    try {
      await api.put(`/customers/${pricingCustomer.id}/pricing/${productId}`, { price: Number(raw) });
      setPricingRows((prev) => prev.map((r) => (r.product_id === productId ? { ...r, custom_price: Number(raw) } : r)));
      toast.success('Custom price saved.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save price.');
    } finally {
      setSavingProductId(null);
    }
  };

  const handleResetCustomPrice = async (productId) => {
    setSavingProductId(productId);
    try {
      await api.delete(`/customers/${pricingCustomer.id}/pricing/${productId}`);
      setPricingRows((prev) => prev.map((r) => (r.product_id === productId ? { ...r, custom_price: null } : r)));
      setPriceInputs((prev) => ({ ...prev, [productId]: '' }));
      toast.success('Reverted to default price.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset price.');
    } finally {
      setSavingProductId(null);
    }
  };

  const visiblePricingRows = pricingSearch.trim()
    ? pricingRows.filter((r) => r.name.toLowerCase().includes(pricingSearch.trim().toLowerCase()))
    : pricingRows;

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
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customers Management</h1>
          <p className="text-sm text-gray-500 mt-1">Review pending approvals and manage your customer database.</p>
        </div>
        <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
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
                      <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wide">Rate</th>
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
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                  (RATE_BADGE[customer.rate_tier] || RATE_BADGE.manual).classes
                                }`}
                              >
                                {(RATE_BADGE[customer.rate_tier] || RATE_BADGE.manual).label}
                              </span>
                              <select
                                value={customer.rate_tier || 'manual'}
                                onChange={(e) => handleChangeRateTier(customer, e.target.value)}
                                className="border border-gray-200 rounded-md px-1.5 py-0.5 text-[11px] text-gray-500 focus:outline-none focus:ring-1 focus:ring-navy-chip focus:border-navy bg-white cursor-pointer"
                              >
                                {RATE_TIERS.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label.replace(' Rate', '')}</option>
                                ))}
                              </select>
                            </div>
                          </td>
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
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => openPricingModal(customer)}
                                className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                              >
                                <DollarSign size={13} /> Pricing
                              </button>
                              {onViewLedger && (
                                <button
                                  onClick={() => onViewLedger(customer.id)}
                                  className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium"
                                >
                                  <BookOpen size={13} /> View Ledger
                                </button>
                              )}
                            </div>
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

      {approvingCustomer && (
        <Modal title={`Select Rate Tier — ${approvingCustomer.full_name}`} onClose={() => setApprovingCustomer(null)}>
          <p className="text-sm text-gray-500 mb-4">
            This sets the pricing tier applied to every order this customer places going forward.
          </p>
          <div className="space-y-2.5">
            {RATE_TIERS.map((tier) => (
              <button
                key={tier.value}
                type="button"
                disabled={approvingId === approvingCustomer.id}
                onClick={() => confirmApprove(tier.value)}
                className="w-full flex items-center justify-between gap-3 text-left border border-gray-200 rounded-xl px-4 py-3.5 hover:border-navy hover:bg-navy-chip/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-navy-chip text-navy flex items-center justify-center flex-shrink-0">
                    <Tag size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-navy text-sm">{tier.label}</p>
                    <p className="text-xs text-gray-400">{tier.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-4">
            <Button
              type="button"
              variant="secondary"
              disabled={approvingId === approvingCustomer.id}
              onClick={() => setApprovingCustomer(null)}
            >
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      {pricingCustomer && (
        <Modal title={`Set Custom Pricing — ${pricingCustomer.full_name}`} onClose={() => setPricingCustomer(null)}>
          <p className="text-sm text-gray-500 mb-3">
            Set a specific rate for this customer on individual products — overrides their rate tier for that product only.
          </p>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={pricingSearch}
              onChange={(e) => setPricingSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>

          {pricingLoading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading products…</p>
          ) : visiblePricingRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No products found.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto -mx-1 space-y-2">
              {visiblePricingRows.map((row) => {
                const hasCustom = row.custom_price !== null && row.custom_price !== undefined;
                const isSaving = savingProductId === row.product_id;
                return (
                  <div key={row.product_id} className="flex items-center gap-3 border border-gray-100 rounded-xl px-3.5 py-2.5 mx-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">{row.name}</p>
                      <p className="text-xs text-gray-400">
                        Catalog: PKR {row.catalog_price.toLocaleString()}{hasCustom && <span className="text-navy font-medium"> · Custom: PKR {Number(row.custom_price).toLocaleString()}</span>}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(row.catalog_price)}
                      value={priceInputs[row.product_id] ?? ''}
                      onChange={(e) => setPriceInputs((prev) => ({ ...prev, [row.product_id]: e.target.value }))}
                      className="w-24 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveCustomPrice(row.product_id)}
                      className="text-xs font-semibold text-white bg-navy hover:bg-navy/90 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    {hasCustom && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleResetCustomPrice(row.product_id)}
                        title="Reset to default"
                        className="text-gray-400 hover:text-red-600 disabled:opacity-50 p-1.5"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button type="button" variant="secondary" onClick={() => setPricingCustomer(null)}>Close</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

