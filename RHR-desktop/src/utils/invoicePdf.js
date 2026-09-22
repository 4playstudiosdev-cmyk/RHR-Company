import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const TAX_RATE = 0.18; // 18% sales tax

// "Sale Invoice" template — plain white page, bold company name
// top-left with address/phone under it, "SALE INVOICE" + Inv#/Date
// top-right, a rule, Bill To, a navy-headed items table, a bordered
// Total Amount row, and a signature line. Shared by Orders.js (normal/
// tax/conveyance invoices) and Returns.js (order-return "updated
// invoice" — pass returnAmount to subtract it and relabel the header).
export function buildInvoicePdf(order, { withTax = false, conveyance = 0, invoiceNumber, returnAmount = 0 } = {}) {
  const doc = new jsPDF();
  const customer = order.users || {};
  const items = order.order_items || [];
  const M = 20;
  const PAGE_W = 210;

  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('RHR & COMPANY', M, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text('Industrial Area, Karachi', M, 33);
  doc.text('Phone: +92 332 2110690', M, 38);

  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(returnAmount > 0 ? 'UPDATED INVOICE' : 'SALE INVOICE', PAGE_W - M, 26, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Inv #: ${invoiceNumber || order.order_number}`, PAGE_W - M, 34, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, PAGE_W - M, 40, { align: 'right' });

  doc.setDrawColor(30, 30, 40);
  doc.setLineWidth(0.6);
  doc.line(M, 46, PAGE_W - M, 46);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text('BILL TO:', M, 58);
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 30);
  doc.text(customer.shop_name || customer.full_name || 'Customer', M, 67);

  const rows = items.map((item) => [
    item.product_name,
    `${item.quantity} ${item.products?.unit || ''}`.trim(),
    `Rs ${Number(item.unit_price).toLocaleString()}`,
    `Rs ${Number(item.subtotal).toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: 78,
    head: [['Item Description', 'Qty', 'Rate', 'Amount']],
    body: rows,
    margin: { left: M, right: M },
    headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 10, textColor: [30, 30, 30] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' }
    },
    styles: { cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } }
  });

  const subtotal = Number(order.total_amount);
  const taxAmount = withTax ? subtotal * TAX_RATE : 0;
  const grandTotal = subtotal + taxAmount + conveyance - returnAmount;

  let lineY = doc.lastAutoTable.finalY + 10;
  const extraLines = withTax || conveyance > 0 || returnAmount > 0;

  if (extraLines) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text(`Subtotal: Rs ${subtotal.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
    lineY += 6;
    if (withTax) {
      doc.text(`Sales Tax (18%): Rs ${taxAmount.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
      lineY += 6;
    }
    if (conveyance > 0) {
      doc.text(`Conveyance: Rs ${conveyance.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
      lineY += 6;
    }
    if (returnAmount > 0) {
      doc.setTextColor(192, 57, 43);
      doc.text(`Returned: -Rs ${returnAmount.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
      doc.setTextColor(60, 60, 60);
      lineY += 6;
    }
    lineY += 2;
  }

  doc.setDrawColor(30, 30, 40);
  doc.setLineWidth(0.4);
  doc.line(120, lineY, PAGE_W - M, lineY);
  lineY += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 30);
  doc.text('Total Amount:', 120, lineY);
  doc.text(`Rs ${grandTotal.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
  lineY += 4;
  doc.line(120, lineY, PAGE_W - M, lineY);

  const signY = lineY + 30;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(M, signY, M + 70, signY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('Authorized Signature: _________________________', M, signY + 6);
  doc.text('Thank you for your business!', PAGE_W - M, signY + 6, { align: 'right' });

  const filename = returnAmount > 0
    ? `Updated-Invoice-${order.order_number}.pdf`
    : withTax ? `Invoice-Tax-${order.order_number}.pdf` : `Invoice-${order.order_number}.pdf`;
  doc.save(filename);
}
