import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoDataUrl, drawPdfHeader } from './pdfBranding';

// Downloadable ledger / statement PDF with the company header — shared by the
// Vendor Ledger and Bank pages. `rightCols` are column indexes to right-align
// (amounts); `summary` is [label, value] pairs printed under the table.
export async function exportLedgerPdf({ title, subtitle, head, body, summary = [], rightCols = [], fileName, landscape = false }) {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });
  const logo = await loadLogoDataUrl();
  drawPdfHeader(doc, logo, { title, subtitle: subtitle || `Statement — ${new Date().toLocaleDateString('en-GB')}` });
  autoTable(doc, {
    startY: 48,
    head: [head],
    body,
    margin: { left: 12, right: 12 },
    headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, valign: 'middle' },
    styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    columnStyles: Object.fromEntries(rightCols.map((i) => [i, { halign: 'right' }])),
  });
  if (summary.length) {
    let y = doc.lastAutoTable.finalY + 8;
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 39, 58);
    summary.forEach(([label, val]) => {
      if (y > pageH - 12) { doc.addPage(); y = 20; }
      doc.text(`${label}: ${val}`, 12, y); y += 6;
    });
  }
  const safe = (fileName || title).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  doc.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const pdfAmount = (n) => (Number(n) ? `PKR ${Number(n).toLocaleString()}` : '-');
export const pdfDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
