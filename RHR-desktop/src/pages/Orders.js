import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, FileDown, Search, Plus, Trash2, Eye, Truck, Printer } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import Button from '../components/Button';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';
import { buildInvoicePdf } from '../utils/invoicePdf';

// Matches the backend's validStatuses in orders.service.js
const STATUS_OPTIONS = ['pending', 'confirmed', 'preparing', 'dispatched', 'delivered', 'cancelled'];
const TABS = ['all', ...STATUS_OPTIONS];

// Forward-only progression, mirrored from orders.service.js's
// isValidTransition — the Update dropdown only offers stages ahead of
// where the order already is (plus Cancel), never a passed stage like
// re-selecting "confirmed" after it's already confirmed. 'delivered' and
// 'cancelled' are terminal — nothing to update from there.
const STATUS_PROGRESSION = ['pending', 'confirmed', 'preparing', 'dispatched', 'delivered'];
function availableNextStatuses(currentStatus) {
  if (currentStatus === 'delivered' || currentStatus === 'cancelled') return [];
  const idx = STATUS_PROGRESSION.indexOf(currentStatus);
  if (idx === -1) return [];
  return [...STATUS_PROGRESSION.slice(idx + 1), 'cancelled'];
}
const PAGE_SIZE = 10;
const TAX_RATE = 0.18; // 18% sales tax
const EMPTY_ORDER_FORM = { customer_id: '', items: [{ product_id: '', quantity: 1 }], delivery_address: '', notes: '' };

export default function Orders() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId; // KHI default
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER_FORM);
  const [creating, setCreating] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [viewLoadingId, setViewLoadingId] = useState(null);

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchingOrder, setDispatchingOrder] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({ driver_id: '', car_number: '', delivery_address: '' });
  const [driversList, setDriversList] = useState([]);
  const [dispatching, setDispatching] = useState(false);

  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [invoiceStep, setInvoiceStep] = useState(1); // 1 = tax question, 2 = conveyance question
  const [taxChoice, setTaxChoice] = useState(null); // 'with' | 'without'
  const [wantsConveyance, setWantsConveyance] = useState(false);
  const [conveyanceAmount, setConveyanceAmount] = useState('');
  const [conveyanceError, setConveyanceError] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  // "Edit Invoice" — shown once an order already has an invoice
  // (order.invoice_generated_at set). Lets the admin record bags
  // returned and download an updated invoice reflecting the reduced total.
  const [editInvoiceOrder, setEditInvoiceOrder] = useState(null); // full order detail (order_items etc.)
  const [editInvoiceItemId, setEditInvoiceItemId] = useState(''); // which line item, when an order has more than one
  const [bagsReturned, setBagsReturned] = useState('');
  const [bagsReturnedError, setBagsReturnedError] = useState('');
  const [editInvoiceLoadingId, setEditInvoiceLoadingId] = useState(null);
  const [savingReturn, setSavingReturn] = useState(false);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const openCreateOrder = async () => {
    setShowCreateOrder(true);
    try {
      const [customersRes, productsRes] = await Promise.all([
        api.get('/customers'),
        api.get('/products', { params: { limit: 500 } })
      ]);
      setCustomers(customersRes.data.data || []);
      setProducts(productsRes.data.data?.products || []);
    } catch (err) {
      toast.error('Failed to load customers/products.');
    }
  };

  const updateItem = (index, field, value) => {
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    }));
  };

  const addItemRow = () => {
    setOrderForm((prev) => ({ ...prev, items: [...prev.items, { product_id: '', quantity: 1 }] }));
  };

  const removeItemRow = (index) => {
    setOrderForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const orderFormTotal = orderForm.items.reduce((sum, it) => {
    const product = products.find((p) => p.id === it.product_id);
    if (!product) return sum;
    return sum + Number(product.price || 0) * Number(it.quantity || 0);
  }, 0);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.customer_id) { toast.error('Select a customer.'); return; }
    const items = orderForm.items
      .filter((it) => it.product_id && Number(it.quantity) > 0)
      .map((it) => ({ product_id: it.product_id, quantity: Number(it.quantity) }));
    if (items.length === 0) { toast.error('Add at least one product.'); return; }

    setCreating(true);
    try {
      await api.post('/orders', {
        customer_id: orderForm.customer_id,
        items,
        delivery_address: orderForm.delivery_address,
        notes: orderForm.notes
      });
      toast.success('Order created.');
      setShowCreateOrder(false);
      setOrderForm(EMPTY_ORDER_FORM);
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order.');
    } finally {
      setCreating(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const data = companyFilter
        ? (await api.get('/orders', { params: { company_id: companyFilter } })).data.data || []
        : await fetchAllCities('/orders');
      setOrders(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (order, newStatus) => {
    if (newStatus === order.status) return;
    // Dispatching needs a driver assigned first — hand off to the
    // dispatch popup instead of patching immediately.
    if (newStatus === 'dispatched') {
      openDispatchModal(order);
      return;
    }
    setUpdatingId(order.id);
    try {
      await api.patch(`/orders/${order.id}/status`, { status: newStatus });
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
      );
      toast.success(`Order ${order.order_number} marked as ${newStatus}.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update order status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openDispatchModal = async (order) => {
    setDispatchingOrder(order);
    setDispatchForm({ driver_id: '', car_number: '', delivery_address: order.delivery_address || '' });
    setShowDispatchModal(true);
    if (driversList.length === 0) {
      try {
        const companyFilter = selectedCity === 'all' ? order.company_id : selectedCity;
        const res = await api.get('/drivers', { params: { company_id: companyFilter } });
        setDriversList(res.data.data || []);
      } catch (err) {
        toast.error('Failed to load drivers list.');
      }
    }
  };

  const handleDriverSelect = (driverId) => {
    const driver = driversList.find((d) => d.id === driverId);
    setDispatchForm((prev) => ({ ...prev, driver_id: driverId, car_number: driver?.car_number || '' }));
  };

  const confirmDispatch = async () => {
    if (!dispatchForm.driver_id) { toast.error('Select a driver.'); return; }
    setDispatching(true);
    try {
      await api.patch(`/orders/${dispatchingOrder.id}/status`, {
        status: 'dispatched',
        driver_id: dispatchForm.driver_id,
        car_number: dispatchForm.car_number,
        delivery_address: dispatchForm.delivery_address
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === dispatchingOrder.id ? { ...o, status: 'dispatched' } : o))
      );
      toast.success(`Order ${dispatchingOrder.order_number} dispatched.`);
      setShowDispatchModal(false);
      setDispatchingOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to dispatch order.');
    } finally {
      setDispatching(false);
    }
  };

  const handleViewOrder = async (order) => {
    setViewLoadingId(order.id);
    try {
      const res = await api.get(`/orders/${order.id}`);
      setSelectedOrder(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load order details.');
    } finally {
      setViewLoadingId(null);
    }
  };

  // One "Create Invoice" entry point — a 2-step modal asks tax first,
  // then conveyance, instead of two separate Invoice/+Tax buttons.
  const handleInvoice = (order) => {
    setInvoiceOrder(order);
    setInvoiceStep(1);
    setTaxChoice(null);
    setWantsConveyance(false);
    setConveyanceAmount('');
    setConveyanceError('');
  };

  const chooseTax = (choice) => {
    setTaxChoice(choice);
    setInvoiceStep(2);
  };

  const confirmGenerateInvoice = async () => {
    const order = invoiceOrder;
    const withTax = taxChoice === 'with';

    let conveyance = 0;
    if (wantsConveyance) {
      conveyance = Number(conveyanceAmount);
      if (!conveyanceAmount || isNaN(conveyance) || conveyance <= 0) {
        setConveyanceError('Enter a valid conveyance amount before generating the invoice.');
        return;
      }
    }

    setGeneratingInvoice(true);
    setPdfLoadingId(order.id);
    try {
      const res = await api.get(`/orders/${order.id}`);
      const detail = res.data.data;
      const taxAmount = withTax ? Number(detail.total_amount) * TAX_RATE : 0;

      buildInvoicePdf(detail, { withTax, conveyance });

      // Tax and conveyance aren't part of orders.total_amount, so without
      // this the customer's ledger (and anything that rolls up from it —
      // Reports Outstanding, etc.) would under-count what they actually
      // owe once either is added to a printed invoice.
      const charges = [];
      if (taxAmount > 0) charges.push({ amount: taxAmount, description: `Sales Tax (18%) — Order #${order.order_number}` });
      if (conveyance > 0) charges.push({ amount: conveyance, description: `Conveyance Charge — Order #${order.order_number}` });
      for (const charge of charges) {
        await api.post('/ledger/adjustment', {
          customer_id: detail.customer_id,
          entry_type: 'debit',
          amount: charge.amount,
          description: charge.description
        });
      }
      if (charges.length > 0) {
        toast.success(`Invoice downloaded — ${charges.map((c) => c.description.split(' — ')[0]).join(' + ')} added to ${detail.users?.full_name || 'the customer'}'s ledger.`);
      } else {
        toast.success(`Invoice for ${order.order_number} downloaded.`);
      }

      // First invoice for this order — flips the button to "Edit
      // Invoice" from here on (no-ops quietly pre-migration).
      api.patch(`/orders/${order.id}/mark-invoiced`)
        .then((r) => {
          if (r.data.data?.invoice_generated_at) {
            setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, invoice_generated_at: r.data.data.invoice_generated_at } : o)));
          }
        })
        .catch(() => {});

      setInvoiceOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate invoice.');
    } finally {
      setGeneratingInvoice(false);
      setPdfLoadingId(null);
    }
  };

  const openEditInvoice = async (order) => {
    setEditInvoiceLoadingId(order.id);
    try {
      const res = await api.get(`/orders/${order.id}`);
      const detail = res.data.data;
      setEditInvoiceOrder(detail);
      setEditInvoiceItemId(detail.order_items?.[0]?.id || '');
      setBagsReturned('');
      setBagsReturnedError('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load order details.');
    } finally {
      setEditInvoiceLoadingId(null);
    }
  };

  const editInvoiceItem = editInvoiceOrder?.order_items?.find((it) => it.id === editInvoiceItemId) || editInvoiceOrder?.order_items?.[0];
  const bagsReturnedNum = Number(bagsReturned) || 0;
  const returnAmountPreview = editInvoiceItem ? bagsReturnedNum * Number(editInvoiceItem.unit_price) : 0;
  const updatedTotalPreview = editInvoiceOrder ? Number(editInvoiceOrder.total_amount) - returnAmountPreview : 0;

  const confirmGenerateUpdatedInvoice = async () => {
    const order = editInvoiceOrder;
    const item = editInvoiceItem;
    if (!item) { toast.error('This order has no items to return.'); return; }

    const qty = Number(bagsReturned);
    if (!bagsReturned || isNaN(qty) || qty <= 0) {
      setBagsReturnedError('Enter a valid quantity returned.');
      return;
    }
    if (qty > Number(item.quantity)) {
      setBagsReturnedError(`Cannot return more than the ${item.quantity} ${item.products?.unit || ''} sold.`);
      return;
    }

    const returnAmount = qty * Number(item.unit_price);
    setSavingReturn(true);
    try {
      // Same order-return endpoint the Returns page uses — credits the
      // customer's ledger and records the return, so this stays the one
      // place that logic lives.
      await api.post('/returns/orders', {
        order_id: order.id,
        amount_returned: returnAmount,
        notes: `${qty} ${item.products?.unit || 'unit'}(s) of "${item.product_name}" returned`
      });

      buildInvoicePdf(order, { returnAmount });

      toast.success(`Updated invoice downloaded — ${order.users?.full_name || 'the customer'}'s ledger credited PKR ${returnAmount.toLocaleString()}.`);
      setEditInvoiceOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record the return.');
    } finally {
      setSavingReturn(false);
    }
  };

  const counts = useMemo(() => {
    const c = { all: orders.length };
    STATUS_OPTIONS.forEach((s) => { c[s] = orders.filter((o) => o.status === s).length; });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = tab === 'all' ? orders : orders.filter((o) => o.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) => o.order_number?.toLowerCase().includes(q) || o.users?.full_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, tab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-bold text-navy">Orders</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search order # or customer..."
              className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-all shadow-sm"
            />
          </div>
          <Button variant="accent" onClick={openCreateOrder} className="flex items-center gap-2">
            <Plus size={16} /> Create Order
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {/* Status tabs */}
        <div className="flex items-center gap-5 px-6 border-b border-gray-100 overflow-x-auto pt-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); }}
              className={`pb-3 pt-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t ? 'text-navy border-navy' : 'text-gray-400 border-transparent hover:text-navy'
              }`}
            >
              <span className="capitalize">{t}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                tab === t ? 'bg-navy-chip text-navy' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[t] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders here" subtitle={search ? 'Try a different search' : 'Orders placed by customers will appear here'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Total</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">View</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Update</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {pageOrders.map((order, i) => (
                    <tr
                      key={order.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{order.order_number}</td>
                      <td className="px-6 py-3.5 text-gray-600">{order.users?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600 font-medium">
                        PKR {Number(order.total_amount).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => handleViewOrder(order)}
                          disabled={viewLoadingId === order.id}
                          className="flex items-center gap-1.5 bg-navy-chip text-navy border-none rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-navy-chip/70 transition-colors disabled:opacity-50"
                        >
                          <Eye size={13} /> {viewLoadingId === order.id ? 'Loading...' : 'View'}
                        </button>
                      </td>
                      <td className="px-6 py-3.5">
                        {(() => {
                          const nextOptions = availableNextStatuses(order.status);
                          return nextOptions.length === 0 ? (
                            <span className="text-xs text-gray-400 italic">No further changes</span>
                          ) : (
                            <select
                              value={order.status}
                              disabled={updatingId === order.id}
                              onChange={(e) => handleStatusChange(order, e.target.value)}
                              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                            >
                              <option value={order.status}>{order.status}</option>
                              {nextOptions.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-3.5">
                        {order.invoice_generated_at ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleInvoice(order)}
                              disabled={pdfLoadingId === order.id}
                              title="Print / re-generate this invoice"
                              className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                            >
                              <Printer size={14} />
                              {pdfLoadingId === order.id ? 'Generating...' : 'Print'}
                            </button>
                            <button
                              onClick={() => openEditInvoice(order)}
                              disabled={editInvoiceLoadingId === order.id}
                              title="Record a return and download an updated invoice"
                              className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                            >
                              <FileDown size={14} />
                              {editInvoiceLoadingId === order.id ? 'Loading...' : 'Edit Invoice'}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleInvoice(order)}
                            disabled={pdfLoadingId === order.id}
                            className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                          >
                            <FileDown size={14} />
                            {pdfLoadingId === order.id ? 'Generating...' : 'Create Invoice'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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
          </>
        )}
      </div>

      {showCreateOrder && (
        <Modal title="Create Order" onClose={() => setShowCreateOrder(false)}>
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer *</label>
              <select
                value={orderForm.customer_id}
                onChange={(e) => setOrderForm({ ...orderForm, customer_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}{c.shop_name ? ` — ${c.shop_name}` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Products *</label>
              <div className="space-y-2">
                {orderForm.items.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                      className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — PKR {Number(p.price).toLocaleString()} (Stock: {p.stock_quantity} {p.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      className="w-20 flex-shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(i)}
                      disabled={orderForm.items.length === 1}
                      className="flex-shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed px-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="mt-2 text-sm text-navy font-medium hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Add another product
              </button>
              {orderFormTotal > 0 && (
                <div className="mt-3 bg-navy-chip/40 border border-navy-chip rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy">Order Total</span>
                  <span className="text-base font-bold text-navy">PKR {orderFormTotal.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Address</label>
              <textarea
                rows={2}
                value={orderForm.delivery_address}
                onChange={(e) => setOrderForm({ ...orderForm, delivery_address: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                rows={2}
                value={orderForm.notes}
                onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowCreateOrder(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={creating}>{creating ? 'Creating...' : 'Create Order'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {selectedOrder && (
        <Modal title={`Order #${selectedOrder.order_number}`} onClose={() => setSelectedOrder(null)}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400">{new Date(selectedOrder.created_at).toLocaleDateString('en-GB')}</p>
            <StatusBadge status={selectedOrder.status} />
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-5 space-y-1">
            <p className="text-sm font-semibold text-navy">{selectedOrder.users?.full_name || '—'}</p>
            <p className="text-xs text-gray-500">Phone: {selectedOrder.users?.phone || '—'}</p>
            <p className="text-xs text-gray-500">Address: {selectedOrder.delivery_address || selectedOrder.users?.shop_address || '—'}</p>
          </div>

          <h4 className="text-sm font-semibold text-navy mb-2">Order Items</h4>
          <div className="overflow-x-auto mb-4 border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Product</th>
                  <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Unit Price</th>
                  <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedOrder.order_items || []).map((item, i) => (
                  <tr key={item.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-navy">{item.product_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{item.quantity} {item.products?.unit || ''}</td>
                    <td className="px-4 py-2.5 text-gray-600">PKR {Number(item.unit_price).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-semibold text-navy">PKR {Number(item.subtotal).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy">
                  <td colSpan={3} className="px-4 py-3 text-white font-semibold text-sm">TOTAL</td>
                  <td className="px-4 py-3 text-orange font-bold text-sm">PKR {Number(selectedOrder.total_amount).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selectedOrder.notes && (
            <div className="bg-orange-50 border border-orange/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-amber-800">📝 Notes: {selectedOrder.notes}</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedOrder(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {showDispatchModal && dispatchingOrder && (
        <Modal title={`Dispatch Order #${dispatchingOrder.order_number}`} onClose={() => setShowDispatchModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Driver *</label>
              <select
                value={dispatchForm.driver_id}
                onChange={(e) => handleDriverSelect(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">-- Select Driver --</option>
                {driversList.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}{d.car_number ? ` — ${d.car_number}` : ''}</option>
                ))}
              </select>
              {driversList.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No drivers in this branch — add one under Drivers first.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Car Number</label>
              <input
                type="text"
                value={dispatchForm.car_number}
                onChange={(e) => setDispatchForm({ ...dispatchForm, car_number: e.target.value })}
                placeholder="e.g. KHI-1234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Address</label>
              <input
                type="text"
                value={dispatchForm.delivery_address}
                onChange={(e) => setDispatchForm({ ...dispatchForm, delivery_address: e.target.value })}
                placeholder="Enter delivery address"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowDispatchModal(false)}>Cancel</Button>
              <Button type="button" variant="accent" onClick={confirmDispatch} disabled={dispatching} className="flex items-center gap-2">
                <Truck size={15} /> {dispatching ? 'Dispatching...' : 'Confirm Dispatch'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {invoiceOrder && invoiceStep === 1 && (
        <Modal title={`Create Invoice — ${invoiceOrder.order_number}`} onClose={() => setInvoiceOrder(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Include the 18% sales tax on this invoice?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => chooseTax('with')}
                className="border-2 border-navy/20 hover:border-navy hover:bg-navy-chip/30 rounded-xl px-4 py-4 text-center transition-colors"
              >
                <p className="font-semibold text-navy text-sm">With Tax</p>
                <p className="text-xs text-gray-400 mt-1">Adds 18% sales tax</p>
              </button>
              <button
                type="button"
                onClick={() => chooseTax('without')}
                className="border-2 border-navy/20 hover:border-navy hover:bg-navy-chip/30 rounded-xl px-4 py-4 text-center transition-colors"
              >
                <p className="font-semibold text-navy text-sm">Without Tax</p>
                <p className="text-xs text-gray-400 mt-1">Order total only</p>
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" onClick={() => setInvoiceOrder(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {invoiceOrder && invoiceStep === 2 && (
        <Modal title={`Create Invoice${taxChoice === 'with' ? ' (with Tax)' : ''} — ${invoiceOrder.order_number}`} onClose={() => setInvoiceOrder(null)}>
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 border border-gray-200 rounded-lg px-3.5 py-3 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={wantsConveyance}
                onChange={(e) => {
                  setWantsConveyance(e.target.checked);
                  setConveyanceError('');
                  if (!e.target.checked) setConveyanceAmount('');
                }}
              />
              <span className="text-sm text-gray-700">Add a conveyance (delivery) charge to this invoice</span>
            </label>

            {wantsConveyance && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Conveyance Amount (PKR) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  autoFocus
                  value={conveyanceAmount}
                  onChange={(e) => { setConveyanceAmount(e.target.value); setConveyanceError(''); }}
                  placeholder="e.g. 500"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow ${
                    conveyanceError ? 'border-red-400 focus:ring-red-200 focus:border-red-500' : 'border-gray-300 focus:ring-navy focus:border-navy'
                  }`}
                />
                {conveyanceError && <p className="text-xs text-red-600 mt-1.5">{conveyanceError}</p>}
                <p className="text-xs text-gray-400 mt-1.5">Added as its own line on the invoice, on top of the order total{taxChoice === 'with' ? ' and tax' : ''}.</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setInvoiceStep(1)}>Back</Button>
              <Button type="button" variant="accent" onClick={confirmGenerateInvoice} disabled={generatingInvoice} className="flex items-center gap-2">
                <FileDown size={15} /> {generatingInvoice ? 'Generating...' : 'Generate Invoice'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editInvoiceOrder && (
        <Modal title={`Edit Invoice — ${editInvoiceOrder.order_number}`} onClose={() => setEditInvoiceOrder(null)}>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1 text-sm">
              <p className="text-gray-600">Customer: <span className="font-semibold text-navy">{editInvoiceOrder.users?.full_name || '—'}</span></p>
              {editInvoiceOrder.order_items?.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Item:</span>
                  <select
                    value={editInvoiceItemId}
                    onChange={(e) => { setEditInvoiceItemId(e.target.value); setBagsReturned(''); setBagsReturnedError(''); }}
                    className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-navy"
                  >
                    {editInvoiceOrder.order_items.map((it) => (
                      <option key={it.id} value={it.id}>{it.product_name} — {it.quantity} {it.products?.unit || ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-gray-600">
                  Sold: <span className="font-semibold text-navy">{editInvoiceItem?.quantity} {editInvoiceItem?.products?.unit || ''} — {editInvoiceItem?.product_name}</span>
                </p>
              )}
              <p className="text-gray-600">Total: <span className="font-semibold text-navy">PKR {Number(editInvoiceOrder.total_amount).toLocaleString()}</span></p>
              <p className="text-gray-600">Date: <span className="font-semibold text-navy">{new Date(editInvoiceOrder.created_at).toLocaleDateString('en-GB')}</span></p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {editInvoiceItem?.products?.unit ? `${editInvoiceItem.products.unit.replace(/^\w/, (c) => c.toUpperCase())}s` : 'Units'} Returned *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                max={editInvoiceItem?.quantity}
                autoFocus
                value={bagsReturned}
                onChange={(e) => { setBagsReturned(e.target.value); setBagsReturnedError(''); }}
                placeholder={`Max ${editInvoiceItem?.quantity || 0}`}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow ${
                  bagsReturnedError ? 'border-red-400 focus:ring-red-200 focus:border-red-500' : 'border-gray-300 focus:ring-navy focus:border-navy'
                }`}
              />
              {bagsReturnedError && <p className="text-xs text-red-600 mt-1.5">{bagsReturnedError}</p>}
            </div>

            <div className="bg-navy-chip/30 border border-navy-chip rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500">Updated Total (after return)</p>
              <p className="text-lg font-bold text-navy">PKR {updatedTotalPreview.toLocaleString()}</p>
              {bagsReturnedNum > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  PKR {Number(editInvoiceOrder.total_amount).toLocaleString()} − ({bagsReturnedNum} × PKR {Number(editInvoiceItem?.unit_price || 0).toLocaleString()}) = PKR {updatedTotalPreview.toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditInvoiceOrder(null)}>Cancel</Button>
              <Button type="button" variant="accent" onClick={confirmGenerateUpdatedInvoice} disabled={savingReturn} className="flex items-center gap-2">
                <FileDown size={15} /> {savingReturn ? 'Saving...' : 'Generate Updated Invoice'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
