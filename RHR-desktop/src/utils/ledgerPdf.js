import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLogoDataUrl, drawPdfHeader } from './pdfBranding';

const NAVY = [27, 39, 58];
const CITY_BY_ID = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': 'Karachi',
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd662267': 'Sukkur',
};
export const cityNameOf = (companyId) => CITY_BY_ID[companyId] || '';

// Downloadable ledger statement with the company header — shared by the
// Vendor Ledger and Bank pages.
//   docType  — short heading printed top-right ("Vendor Ledger"); kept short so
//              it never runs into the company name
//   details  — [label, value] rows printed in a box under the header
//              (account / supplier name, contact, city, period …)
//   summary  — [label, value] rows printed as a totals box under the table;
//              the last row is highlighted as the closing figure
//   rightCols — column indexes to right-align (amounts)
export async function exportLedgerPdf({
  docType, details = [], head, body, summary = [], rightCols = [], fileName, landscape = false, city,
}) {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 20;
  const logo = await loadLogoDataUrl();
  drawPdfHeader(doc, logo, {
    title: docType,
    subtitle: `Printed on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    city,
  });

  // ── Details box (who / which account this statement is for)
  let y = 44;
  if (details.length) {
    const rows = Math.ceil(details.length / 2);
    const boxH = 6 + rows * 6;
    doc.setFillColor(245, 247, 251);
    doc.setDrawColor(220, 225, 235);
    doc.roundedRect(M, y, pageW - 2 * M, boxH, 2, 2, 'FD');
    const colW = (pageW - 2 * M) / 2;
    details.forEach(([label, value], i) => {
      const cx = M + 4 + (i % 2) * colW;
      const cy = y + 6.5 + Math.floor(i / 2) * 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 110, 110);
      doc.text(`${label}:`, cx, cy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 30);
      doc.text(String(value ?? '-'), cx + doc.getTextWidth(`${label}: `) + 1, cy, { maxWidth: colW - 30 });
    });
    y += boxH + 5;
  }

  // ── Entries
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: M, right: M, bottom: 16 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5, valign: 'middle', textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, overflow: 'linebreak' },
    columnStyles: Object.fromEntries(rightCols.map((i) => [i, { halign: 'right' }])),
  });

  // ── Totals box
  if (summary.length) {
    let sy = doc.lastAutoTable.finalY + 6;
    const boxW = 95;
    const boxH = 4 + summary.length * 7;
    if (sy + boxH > pageH - 18) { doc.addPage(); sy = 20; }
    const bx = pageW - M - boxW;
    doc.setDrawColor(220, 225, 235);
    doc.roundedRect(bx, sy, boxW, boxH, 2, 2, 'S');
    summary.forEach(([label, value], i) => {
      const ry = sy + 7 + i * 7;
      const last = i === summary.length - 1;
      if (last) {
        doc.setFillColor(...NAVY);
        doc.rect(bx, ry - 5, boxW, 7, 'F');
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setTextColor(60, 60, 60);
      }
      doc.setFont('helvetica', last ? 'bold' : 'normal'); doc.setFontSize(8.5);
      doc.text(label, bx + 4, ry);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value), bx + boxW - 4, ry, { align: 'right' });
    });
  }

  // ── Footer on every page
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140, 140, 140);
    doc.text('This is a computer-generated statement and does not require a signature.', M, pageH - 8);
    doc.text(`Page ${p} of ${pages}`, pageW - M, pageH - 8, { align: 'right' });
  }

  const safe = (fileName || docType || 'Statement').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  doc.save(`${safe}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const pdfAmount = (n) => (Number(n) ? `PKR ${Number(n).toLocaleString()}` : '-');
export const pdfMoney = (n) => `PKR ${Math.abs(Number(n) || 0).toLocaleString()}`;
export const pdfDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
