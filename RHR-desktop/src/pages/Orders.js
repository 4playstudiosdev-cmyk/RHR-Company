import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ShoppingCart, FileDown } from 'lucide-react';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

// Matches the backend's validStatuses in orders.service.js
const STATUS_OPTIONS = ['pending', 'confirmed', 'preparing', 'dispatched', 'delivered', 'cancelled'];

export default function Orders() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (order, newStatus) => {
    if (newStatus === order.status) return;
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

  const handleInvoice = async (order) => {
    setPdfLoadingId(order.id);
    try {
      const res = await api.get(`/orders/${order.id}`);
      const detail = res.data.data;
      buildInvoicePdf(detail);
      toast.success(`Invoice for ${order.order_number} downloaded.`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate invoice.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const buildInvoicePdf = (order) => {
    const doc = new jsPDF();
    const customer = order.users || {};
    const items = order.order_items || [];

    // Header
    doc.setFillColor(27, 46, 107); // navy
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RHR & COMPANY', 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Construction Materials Manufacturer', 14, 22);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 196, 18, { align: 'right' });

    // Meta + customer info
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Order #: ${order.order_number}`, 14, 42);
    doc.text(
      `Date: ${new Date(order.created_at).toLocaleDateString('en-GB')}`,
      14,
      48
    );
    doc.text(`Status: ${order.status}`, 14, 54);

    doc.text('Bill To:', 140, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(customer.full_name || 'Customer', 140, 48);
    doc.text(customer.phone || '', 140, 54);
    if (order.delivery_address) {
      doc.text(doc.splitTextToSize(order.delivery_address, 56), 140, 60);
    }

    // Items table
    const rows = items.map((item, i) => [
      i + 1,
      item.product_name,
      item.quantity,
      `PKR ${Number(item.unit_price).toLocaleString()}`,
      `PKR ${Number(item.subtotal).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 70,
      head: [['#', 'Product', 'Qty', 'Unit Price', 'Subtotal']],
      body: rows,
      headStyles: { fillColor: [27, 46, 107] },
      styles: { fontSize: 9 }
    });

    const finalY = doc.lastAutoTable.finalY || 80;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(
      `Grand Total: PKR ${Number(order.total_amount).toLocaleString()}`,
      196,
      finalY + 12,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Thank you for your business — RHR & Company', 105, finalY + 30, {
      align: 'center'
    });

    doc.save(`Invoice-${order.order_number}.pdf`);
  };

  return (
    <div className="p-6">
      <PageHeader title="Orders" subtitle="Track and update order fulfilment" />

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {orders.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No orders yet" subtitle="Orders placed by customers will appear here" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Order #</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Total</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Update Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, i) => (
                  <tr
                    key={order.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-medium text-navy">{order.order_number}</td>
                    <td className="px-6 py-3.5 text-gray-600">{order.users?.full_name || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">
                      PKR {Number(order.total_amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-6 py-3.5">
                      <select
                        value={order.status}
                        disabled={updatingId === order.id}
                        onChange={(e) => handleStatusChange(order, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status} disabled={status === 'pending'}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => handleInvoice(order)}
                        disabled={pdfLoadingId === order.id}
                        className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                      >
                        <FileDown size={14} />
                        {pdfLoadingId === order.id ? 'Generating...' : 'Invoice PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
