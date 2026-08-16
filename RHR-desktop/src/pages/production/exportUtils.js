import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// Shared PDF export — matches the navy/orange letterhead style used
// elsewhere in the app (see Orders.js's invoice PDF).
export function exportTableToPDF({ title, subtitle, head, rows, filename }) {
  const doc = new jsPDF();

  doc.setFillColor(27, 46, 107); // navy
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('RHR & COMPANY', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 21);
  if (subtitle) {
    doc.setFontSize(8);
    doc.text(subtitle, 14, 26);
  }

  autoTable(doc, {
    startY: 34,
    head: [head],
    body: rows,
    headStyles: { fillColor: [27, 46, 107] },
    styles: { fontSize: 9 }
  });

  doc.save(`${filename}.pdf`);
}

// Shared Excel export
export function exportTableToExcel({ sheetName, head, rows, filename }) {
  const worksheet = XLSX.utils.aoa_to_sheet([head, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
