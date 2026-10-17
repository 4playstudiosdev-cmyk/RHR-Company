import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoDataUrl, drawPdfHeader } from './pdfBranding';

const TAX_RATE = 0.18; // 18% sales tax

// "Sale Invoice" template — shared branded header (see pdfBranding.js),
// a two-column order-detail block (customer/delivery info on the left,
// order/dispatch info on the right), an items table, a Subtotal/Net
// Total Payable block, and a signature line. Shared by Orders.js
// (normal/tax/conveyance invoices, and the read-only preview) and
// Returns.js (order-return "updated invoice" — pass returnAmount to
// subtract it and relabel the header). Async because the logo has to
// load before it can be embedded — every call site already runs inside
// an async handler, so this just needs an `await` added.
export async function buildInvoicePdf(order, { withTax = false, conveyance = 0, invoiceNumber, returnAmount = 0, preview = false } = {}) {
  const doc = new jsPDF();
  const customer = order.users || {};
  const driver = order.drivers || {};
  const salesman = order.salesmen || {};
  const items = order.order_items || [];
  const M = 20;
  const PAGE_W = 210;

  const logoDataUrl = await loadLogoDataUrl();
  drawPdfHeader(doc, logoDataUrl, {
    title: returnAmount > 0 ? 'UPDATED INVOICE' : 'SALE INVOICE',
    subtitle: 'Sales Tax Invoice & Delivery Challan',
  });

  // ── Order detail block — two columns, labels left-aligned to a fixed
  // offset so values line up regardless of label length.
  const LABEL_W = 34;
  const colLeftX = M;
  const colRightX = 112;
  let leftY = 48;
  let rightY = 48;

  const field = (x, y, label, value) => {
    if (!value) return y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 30);
    doc.text(String(value), x + LABEL_W, y, { maxWidth: colLeftX === x ? 80 : 68 });
    return y + 6.5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 30);
  doc.text(`Invoice / Order No: ${invoiceNumber || order.order_number}`, colLeftX, leftY);
  leftY += 8;

  // Made out to the shop / business name (the person's name when there
  // isn't one); the proprietor's own name follows it.
  leftY = field(colLeftX, leftY, 'Customer:', customer.shop_name || customer.full_name);
  if (customer.shop_name) leftY = field(colLeftX, leftY, 'Proprietor:', customer.full_name);
  leftY = field(colLeftX, leftY, 'Delivery Addr:', order.delivery_address || customer.shop_address);
  leftY = field(colLeftX, leftY, 'Contact:', customer.phone);

  rightY = field(colRightX, rightY, 'Order Date:', new Date(order.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  rightY = field(colRightX, rightY, 'Sales Officer:', salesman.full_name);
  rightY = field(colRightX, rightY, 'Vehicle:', driver.car_number);
  rightY = field(colRightX, rightY, 'Driver:', driver.full_name);
  rightY = field(colRightX, rightY, 'Status:', order.status ? order.status.toUpperCase() : null);

  const tableStartY = Math.max(leftY, rightY) + 5;

  const rows = items.map((item, i) => [
    i + 1,
    item.product_name,
    item.products?.unit || '—',
    item.quantity,
    `Rs ${Number(item.unit_price).toLocaleString()}`,
    `Rs ${Number(item.subtotal).toLocaleString()}`
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['#', 'Product Description', 'Pack Size', 'Qty', 'Rate (PKR)', 'Amount (PKR)']],
    body: rows,
    margin: { left: M, right: M },
    headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5, textColor: [30, 30, 30] },
    columnStyles: {
      0: { cellWidth: 10 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' }
    },
    styles: { cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } }
  });

  const subtotal = Number(order.total_amount);
  const taxAmount = withTax ? subtotal * TAX_RATE : 0;
  const grandTotal = subtotal + taxAmount + conveyance - returnAmount;

  let lineY = doc.lastAutoTable.finalY + 10;

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

  doc.setDrawColor(30, 30, 40);
  doc.setLineWidth(0.4);
  doc.line(110, lineY, PAGE_W - M, lineY);
  lineY += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 30);
  doc.text('Net Total Payable:', 110, lineY);
  doc.text(`Rs ${grandTotal.toLocaleString()}`, PAGE_W - M, lineY, { align: 'right' });
  lineY += 4;
  doc.line(110, lineY, PAGE_W - M, lineY);

  const signY = lineY + 30;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(M, signY, M + 70, signY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text('Authorized Signature: _________________________', M, signY + 6);
  doc.text('Thank you for your business!', PAGE_W - M, signY + 6, { align: 'right' });

  // Preview opens the PDF in a new tab (read-only look, no download
  // prompt, no invoice_generated_at side effects) — for a quick check
  // before/without actually generating the real invoice. Regular
  // generate/print/reprint flows keep forcing a download as before.
  if (preview) {
    window.open(doc.output('bloburl'), '_blank');
    return;
  }

  const filename = returnAmount > 0
    ? `Updated-Invoice-${order.order_number}.pdf`
    : withTax ? `Invoice-Tax-${order.order_number}.pdf` : `Invoice-${order.order_number}.pdf`;
  doc.save(filename);
}
