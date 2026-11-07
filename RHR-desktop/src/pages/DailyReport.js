import React, { useCallback, useEffect, useState } from 'react';
import { FileText, RefreshCw, Download, Calendar, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import CityFilter from '../components/CityFilter';
import { loadLogoDataUrl, drawPdfHeader } from '../utils/pdfBranding';

const todayISO = () => new Date().toISOString().split('T')[0];
const fmtPKR = (n) => `Rs ${Number(n || 0).toLocaleString()}`;
const fmtN = (n) => Number(n || 0).toLocaleString();

const NAVY = [27, 39, 58];
const ORANGE = [232, 132, 26];
const WHITE = [255, 255, 255];

// ─── Section header used throughout the PDF ───────────────────────────
function pdfSectionHeader(doc, y, title, pageW, M) {
  doc.setFillColor(...NAVY);
  doc.rect(M, y, pageW - M * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(title, M + 3, y + 5.5);
  return y + 8;
}

async function buildDailyReportPdf(reportDate, data) {
  const doc = new jsPDF();
  const M = 14;
  const PAGE_W = 210;

  const logoDataUrl = await loadLogoDataUrl();
  const headerEnd = drawPdfHeader(doc, logoDataUrl, {
    title: 'DAILY REPORT',
    subtitle: `Date: ${reportDate}`,
  });

  // Print date/time line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  const now = new Date();
  doc.text(
    `Print Date: ${now.toLocaleDateString('en-GB')}   Print Time: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    M, headerEnd + 6
  );

  let y = headerEnd + 12;

  const checkPage = (needed) => {
    if (y + needed > 280) { doc.addPage(); y = 15; }
  };

  // ── EXPENSE SECTION ────────────────────────────────────────────────
  checkPage(20);
  y = pdfSectionHeader(doc, y, 'EXPENSE', PAGE_W, M);

  if (data.expenses.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('No expenses recorded for this date.', M + 3, y + 6);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['SNo', 'Date', 'A/C Name', 'Description', 'Amount', 'Balance']],
      body: data.expenses.map(e => [
        e.sno, e.date, e.account || e.category, e.description,
        fmtPKR(e.amount), fmtPKR(e.running_balance),
      ]),
      foot: [['', '', '', 'Grand Total', fmtPKR(data.summary.total_expenses), '']],
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      footStyles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 10 }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── RECOVERY SECTION ───────────────────────────────────────────────
  checkPage(20);
  y = pdfSectionHeader(doc, y, 'RECOVERY', PAGE_W, M);

  if (data.recovery.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('No recovery recorded for this date.', M + 3, y + 6);
    y += 10;
  } else {
    const byS = {};
    data.recovery.forEach((r) => {
      if (!byS[r.salesman]) byS[r.salesman] = { salesman: r.salesman, customers: 0, amount: 0 };
      byS[r.salesman].customers += 1;
      byS[r.salesman].amount += Number(r.amount);
    });
    const recRows = Object.values(byS).sort((a, b) => b.amount - a.amount);
    autoTable(doc, {
      startY: y,
      head: [['SNo', 'Salesman', 'Customers Collected From', 'Total Amount']],
      body: recRows.map((r, i) => [i + 1, r.salesman, r.customers, fmtPKR(r.amount)]),
      foot: [['', '', 'Grand Total', fmtPKR(data.summary.total_recovery)]],
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      footStyles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'center' }, 3: { halign: 'right' } },
      styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── SALES SECTION ──────────────────────────────────────────────────
  checkPage(20);
  y = pdfSectionHeader(doc, y, 'SALES (DELIVERED ORDERS)', PAGE_W, M);

  if (data.sales.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('No delivered orders for this date.', M + 3, y + 6);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['SNo', 'Date', 'Order #', 'Customer', 'Products', 'BAG', 'KG', 'Amount']],
      body: data.sales.map(s => [
        s.sno, s.date, s.order_number, s.customer, s.products,
        fmtN(s.bags), s.kg ? fmtN(s.kg) : '—', fmtPKR(s.total_amount),
      ]),
      foot: [['', '', '', '', 'Grand Total', fmtN(data.summary.total_sale_bags), data.summary.total_sale_kg ? fmtN(data.summary.total_sale_kg) : '—', fmtPKR(data.summary.total_sales)]],
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      footStyles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 10 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── PRODUCTION SECTION ─────────────────────────────────────────────
  checkPage(20);
  y = pdfSectionHeader(doc, y, 'PRODUCTION', PAGE_W, M);

  if (data.production.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('No production recorded for this date.', M + 3, y + 6);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['SNo', 'Date', 'Product', 'BAG', 'KG', 'Total Cost']],
      body: data.production.map(p => [
        p.sno, p.date, p.product, fmtN(p.bags),
        p.total_kg ? fmtN(p.total_kg) : '—', fmtPKR(p.total_cost),
      ]),
      foot: [['', '', 'Grand Total', fmtN(data.summary.total_production_bags), data.summary.total_production_kg ? fmtN(data.summary.total_production_kg) : '—', '']],
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 30, 30] },
      footStyles: { fillColor: NAVY, textColor: ORANGE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── SUMMARY BOX ────────────────────────────────────────────────────
  checkPage(55);
  y = pdfSectionHeader(doc, y, 'SUMMARY', PAGE_W, M);
  y += 3;

  const sumH = 46;
  const colMid = M + (PAGE_W - M * 2) / 2 + 1;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.rect(M, y, PAGE_W - M * 2, sumH);
  doc.line(colMid, y, colMid, y + sumH);

  const sumLeft = [
    ['Previous Cash Balance', fmtPKR(data.summary.previous_cash_balance)],
    ['+ Total Recovery', fmtPKR(data.summary.total_recovery)],
    ['- Total Expenses', fmtPKR(data.summary.total_expenses)],
    ['Net Cash', fmtPKR(data.summary.net_cash)],
    ['Cash In Hand', fmtPKR(data.summary.cash_in_hand)],
  ];
  const sumRight = [
    ['Total Production BAG', fmtN(data.summary.total_production_bags)],
    ['Total Production KG', data.summary.total_production_kg ? fmtN(data.summary.total_production_kg) : '—'],
    ['Total Sale BAG', fmtN(data.summary.total_sale_bags)],
    ['Total Sale KG', data.summary.total_sale_kg ? fmtN(data.summary.total_sale_kg) : '—'],
    ['Total Sales', fmtPKR(data.summary.total_sales)],
    ['Profit', fmtPKR(data.summary.profit)],
  ];

  let rowY = y + 7;
  sumLeft.forEach(([label, val], i) => {
    const isCashInHand = i === sumLeft.length - 1;
    doc.setFont('helvetica', isCashInHand ? 'bold' : 'normal');
    doc.setFontSize(isCashInHand ? 9 : 8);
    if (isCashInHand) { doc.setTextColor(...NAVY); } else { doc.setTextColor(60, 60, 60); }
    doc.text(label, M + 4, rowY);
    doc.text(val, colMid - 4, rowY, { align: 'right' });
    if (isCashInHand) {
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.3);
      doc.line(M + 2, rowY + 1.5, colMid - 2, rowY + 1.5);
    }
    rowY += 7;
  });

  rowY = y + 7;
  sumRight.forEach(([label, val], i) => {
    const isProfit = i === sumRight.length - 1;
    doc.setFont('helvetica', isProfit ? 'bold' : 'normal');
    doc.setFontSize(isProfit ? 9 : 8);
    if (isProfit) { doc.setTextColor(...ORANGE); } else { doc.setTextColor(60, 60, 60); }
    doc.text(label, colMid + 4, rowY);
    doc.text(val, PAGE_W - M - 4, rowY, { align: 'right' });
    rowY += 7;
  });

  y += sumH + 8;

  // ── BANK DETAIL ────────────────────────────────────────────────────
  if (data.bank_detail && data.bank_detail.length > 0) {
    checkPage(20);
    y = pdfSectionHeader(doc, y, 'BANK DETAIL', PAGE_W, M);

    autoTable(doc, {
      startY: y,
      head: [['Account Name', 'Bank', 'Account #', 'Debit (In)', 'Credit (Out)']],
      body: data.bank_detail.map(b => [
        b.account_name, b.bank_name, b.account_number || '—',
        b.day_debit ? fmtPKR(b.day_debit) : '—',
        b.day_credit ? fmtPKR(b.day_credit) : '—',
      ]),
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      styles: { cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Page numbers
  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - M, 290, { align: 'right' });
  }

  doc.save(`Daily-Report-${reportDate}.pdf`);
}

// ─── On-screen section component ──────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mb-5">
      <div className="bg-navy px-5 py-3">
        <h3 className="text-white font-bold text-sm tracking-wide uppercase">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function NoData({ msg }) {
  return <p className="text-xs text-gray-400 italic px-5 py-4">{msg}</p>;
}

export default function DailyReport({ setPage, onGoToRecovery }) {
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;

  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [reportDate, setReportDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [previewOrder, setPreviewOrder] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/daily-report', {
        params: { date: reportDate, company_id: selectedCity },
      });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [reportDate, selectedCity]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const handleDownloadPdf = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      await buildDailyReportPdf(reportDate, data);
    } catch (e) {
      setError('PDF generation failed: ' + e.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const s = data?.summary || {};

  return (
    <div className="p-6">
      <PageHeader
        title="Daily Report"
        subtitle="Complete daily operations: expenses, recovery, sales, production"
        icon={FileText}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => { if (e.target.value) setReportDate(e.target.value); }}
                className="text-sm text-navy bg-transparent outline-none"
              />
            </div>
            <Button variant="secondary" onClick={loadReport} className="flex items-center gap-1.5">
              <RefreshCw size={14} /> Load
            </Button>
            <Button
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={!data || pdfLoading}
              className="flex items-center gap-1.5"
            >
              <Download size={14} /> {pdfLoading ? 'Generating...' : 'Download PDF'}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-navy" />
        </div>
      ) : !data ? null : (
        <>
          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              { label: 'Previous Balance', value: fmtPKR(s.previous_cash_balance), color: 'text-navy' },
              { label: 'Total Recovery', value: fmtPKR(s.total_recovery), color: 'text-green-700' },
              { label: 'Total Expenses', value: fmtPKR(s.total_expenses), color: 'text-red-600' },
              { label: 'Net Balance', value: fmtPKR(s.net_cash), color: 'text-green-700', onClick: () => setPage?.('bank') },
              { label: 'Total Sales', value: fmtPKR(s.total_sales), color: 'text-navy' },
              { label: 'Profit', value: fmtPKR(s.profit), color: s.profit >= 0 ? 'text-green-700' : 'text-red-600' },
            ].map((c) => (
              <div
                key={c.label}
                onClick={c.onClick}
                className={`bg-white rounded-2xl border border-gray-100 shadow-card px-4 py-3 ${c.onClick ? 'cursor-pointer hover:border-navy/40 hover:shadow-md transition-shadow' : ''}`}
              >
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{c.label}</p>
                <p className={`text-base font-bold mt-0.5 ${c.color}`}>{c.value}</p>
                {c.onClick && <p className="text-[10px] text-navy/50 mt-0.5">View Bank →</p>}
              </div>
            ))}
          </div>

          {/* ── Expenses ── */}
          <Section title={`Expense — ${reportDate}`}>
            {data.expenses.length === 0 ? <NoData msg="No expenses for this date." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['SNo', 'Date', 'A/C Name', 'Description', 'Amount', 'Balance'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((e) => (
                      <tr key={e.sno} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400">{e.sno}</td>
                        <td className="px-4 py-2.5">{e.date}</td>
                        <td className="px-4 py-2.5 font-medium text-navy">{e.account || e.category}</td>
                        <td className="px-4 py-2.5 text-gray-600">{e.description}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600">{fmtPKR(e.amount)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-navy">{fmtPKR(e.running_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={4} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtPKR(s.total_expenses)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── Recovery ── */}
          <Section title={`Recovery — ${reportDate}`}>
            {data.recovery.length === 0 ? <NoData msg="No recovery for this date." /> : (() => {
              const byS = {};
              data.recovery.forEach((r) => {
                if (!byS[r.salesman]) byS[r.salesman] = { salesman: r.salesman, salesman_id: r.salesman_id, customers: 0, amount: 0 };
                byS[r.salesman].customers += 1;
                byS[r.salesman].amount += Number(r.amount);
              });
              const rows = Object.values(byS).sort((a, b) => b.amount - a.amount);
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                        {['SNo', 'Salesman', 'Customers', 'Total Recovery'].map(h => (
                          <th key={h} className={`px-4 py-2.5 text-left ${h === 'Total Recovery' ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.salesman} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            {onGoToRecovery && r.salesman_id ? (
                              <button
                                onClick={() => onGoToRecovery(r.salesman_id, reportDate)}
                                className="font-medium text-navy hover:text-orange hover:underline transition-colors cursor-pointer"
                                title={`View ${r.salesman}'s recovery for ${reportDate}`}
                              >
                                {r.salesman}
                              </button>
                            ) : (
                              <span className="font-medium text-navy">{r.salesman}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500">{r.customers} {r.customers === 1 ? 'customer' : 'customers'}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmtPKR(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-navy">
                        <td colSpan={3} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                        <td className="px-4 py-2.5 text-right text-white font-bold">{fmtPKR(s.total_recovery)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </Section>

          {/* ── Sales ── */}
          <Section title={`Sales (Delivered Orders) — ${reportDate}`}>
            {data.sales.length === 0 ? <NoData msg="No delivered orders for this date." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['SNo', 'Date', 'Order #', 'Customer', 'Products', 'BAG', 'KG', 'Amount'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((s) => (
                      <tr key={s.sno} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400">{s.sno}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{s.date}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setPreviewOrder(s)}
                            className="font-medium text-navy hover:text-orange hover:underline transition-colors cursor-pointer whitespace-nowrap"
                            title="Click to preview order"
                          >
                            {s.order_number}
                          </button>
                        </td>
                        <td className="px-4 py-2.5">{s.customer}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{s.products}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{s.bags > 0 ? fmtN(s.bags) : '—'}</td>
                        <td className="px-4 py-2.5 text-right">{s.kg ? fmtN(s.kg) : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmtPKR(s.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={5} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtN(s.total_sale_bags)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{s.total_sale_kg ? fmtN(s.total_sale_kg) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtPKR(s.total_sales)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── Production ── */}
          <Section title={`Production — ${reportDate}`}>
            {data.production.length === 0 ? <NoData msg="No production for this date." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['SNo', 'Date', 'Product'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                      ))}
                      {['BAG', 'KG', 'Total Cost'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.production.map((p) => (
                      <tr key={p.sno} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-gray-400">{p.sno}</td>
                        <td className="px-4 py-2.5">{p.date}</td>
                        <td className="px-4 py-2.5 font-medium text-navy">{p.product}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmtN(p.bags)}</td>
                        <td className="px-4 py-2.5 text-right">{p.total_kg ? fmtN(p.total_kg) : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-navy">{fmtPKR(p.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={3} className="px-4 py-2.5 text-white font-bold text-xs">GRAND TOTAL</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{fmtN(s.total_production_bags)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-bold">{s.total_production_kg ? fmtN(s.total_production_kg) : '—'}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Section>

          {/* ── Summary ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="bg-navy px-5 py-3">
                <h3 className="text-white font-bold text-sm uppercase tracking-wide">Cash Summary</h3>
              </div>
              <div className="p-5 space-y-2">
                {[
                  { label: 'Previous Balance', value: fmtPKR(s.previous_cash_balance), normal: true },
                  { label: '+ Total Recovery', value: fmtPKR(s.total_recovery), color: 'text-green-700' },
                  { label: '- Total Expenses', value: fmtPKR(s.total_expenses), color: 'text-red-600' },
                  { label: 'Net Balance', value: fmtPKR(s.net_cash), bold: true },
                  { label: 'Cash In Hand', value: fmtPKR(s.cash_in_hand), bold: true, color: 'text-navy' },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between items-center py-1 ${row.bold ? 'border-t border-gray-200 pt-2 mt-1' : ''}`}>
                    <span className={`text-sm ${row.bold ? 'font-bold text-navy' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`text-sm font-semibold ${row.color || (row.bold ? 'text-navy' : 'text-gray-800')}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="bg-navy px-5 py-3">
                <h3 className="text-white font-bold text-sm uppercase tracking-wide">Production & Sales Summary</h3>
              </div>
              <div className="p-5 space-y-2">
                {[
                  { label: 'Total Production BAG', value: fmtN(s.total_production_bags) },
                  { label: 'Total Production KG', value: s.total_production_kg ? fmtN(s.total_production_kg) : '—' },
                  { label: 'Total Sale BAG', value: fmtN(s.total_sale_bags) },
                  { label: 'Total Sale KG', value: s.total_sale_kg ? fmtN(s.total_sale_kg) : '—' },
                  { label: 'Total Sales', value: fmtPKR(s.total_sales), bold: true, color: 'text-green-700' },
                  { label: 'Profit', value: fmtPKR(s.profit), bold: true, color: s.profit >= 0 ? 'text-green-700' : 'text-red-600' },
                ].map((row) => (
                  <div key={row.label} className={`flex justify-between items-center py-1 ${row.bold ? 'border-t border-gray-200 pt-2 mt-1' : ''}`}>
                    <span className={`text-sm ${row.bold ? 'font-bold text-navy' : 'text-gray-600'}`}>{row.label}</span>
                    <span className={`text-sm font-semibold ${row.color || 'text-gray-800'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bank Detail ── */}
          {data.bank_detail && data.bank_detail.length > 0 && (
            <Section title="Bank Detail">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                      {['Account Name', 'Bank', 'Account #', 'Debit (In)', 'Credit (Out)'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.bank_detail.map((b) => (
                      <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-medium text-navy">{b.account_name}</td>
                        <td className="px-4 py-2.5">{b.bank_name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{b.account_number || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-700">
                          {b.day_debit ? fmtPKR(b.day_debit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                          {b.day_credit ? fmtPKR(b.day_credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      {/* ── Order Preview Modal ── */}
      {previewOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreviewOrder(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-navy text-white flex-shrink-0">
              <div>
                <p className="text-xs text-white/60 uppercase tracking-wide font-semibold">Order Preview</p>
                <p className="text-lg font-bold">{previewOrder.order_number}</p>
              </div>
              <button onClick={() => setPreviewOrder(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Meta */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 flex-shrink-0">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Customer</p>
                <p className="text-sm font-semibold text-navy">{previewOrder.customer}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Date</p>
                <p className="text-sm font-semibold text-navy">{previewOrder.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total</p>
                <p className="text-sm font-bold text-green-700">{fmtPKR(previewOrder.total_amount)}</p>
              </div>
            </div>

            {/* Items */}
            <div className="overflow-y-auto flex-1">
              {previewOrder.items && previewOrder.items.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">Product</th>
                      <th className="px-5 py-3 text-left">Unit</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3 text-right">Rate</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewOrder.items.map((it, i) => (
                      <tr key={i} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-navy">{it.product_name}</td>
                        <td className="px-5 py-3 text-gray-500">{it.unit || '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold">{fmtN(it.quantity)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmtPKR(it.unit_price)}</td>
                        <td className="px-5 py-3 text-right font-bold text-green-700">{fmtPKR(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-navy">
                      <td colSpan={5} className="px-5 py-3 text-white font-bold text-xs">TOTAL</td>
                      <td className="px-5 py-3 text-right text-white font-bold">{fmtPKR(previewOrder.total_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No item details available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
