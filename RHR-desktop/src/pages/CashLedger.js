import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, RefreshCw, Download, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import CityFilter from '../components/CityFilter';
import { loadLogoDataUrl, drawPdfHeader } from '../utils/pdfBranding';

const todayISO = () => new Date().toISOString().split('T')[0];
const fmtPKR = (n) => `Rs ${Number(n || 0).toLocaleString()}`;

const NAVY = [27, 39, 58];
const ORANGE = [232, 132, 26];
const WHITE = [255, 255, 255];

const CITY_NAMES = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': 'Karachi',
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd662267': 'Sukkur',
};

async function buildPdf(date, data, cityName) {
  const doc = new jsPDF();
  const M = 14;
  const PAGE_W = 210;

  const logoDataUrl = await loadLogoDataUrl();
  const headerEnd = drawPdfHeader(doc, logoDataUrl, {
    title: 'CASH LEDGER',
    subtitle: `Date: ${date}`,
  });

  if (cityName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(27, 46, 107);
    doc.text(cityName.toUpperCase(), PAGE_W - 20, 31, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  const now = new Date();
  doc.text(
    `Print Date: ${now.toLocaleDateString('en-GB')}   Print Time: ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    M, headerEnd + 6
  );

  let y = headerEnd + 12;

  // Opening balance row
  doc.setFillColor(...NAVY);
  doc.rect(M, y, PAGE_W - M * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('CASH LEDGER', M + 3, y + 5.5);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Debit (In)', 'Credit (Out)', 'Balance']],
    body: [
      [
        { content: '', styles: { fontStyle: 'bold' } },
        { content: 'Opening Balance', styles: { fontStyle: 'bold' } },
        { content: '—', styles: { halign: 'right' } },
        { content: '—', styles: { halign: 'right' } },
        { content: fmtPKR(data.opening_balance), styles: { fontStyle: 'bold', halign: 'right' } },
      ],
      ...(data.entries || []).map(e => [
        e.sno,
        e.description,
        e.debit ? fmtPKR(e.debit) : '—',
        e.credit ? fmtPKR(e.credit) : '—',
        fmtPKR(e.running_balance),
      ]),
      [
        { content: 'Closing Balance', colSpan: 2, styles: { fontStyle: 'bold' } },
        { content: fmtPKR(data.total_in), styles: { fontStyle: 'bold', halign: 'right', textColor: [22, 163, 74] } },
        { content: fmtPKR(data.total_out), styles: { fontStyle: 'bold', halign: 'right', textColor: [220, 38, 38] } },
        { content: fmtPKR(data.closing_balance), styles: { fontStyle: 'bold', halign: 'right' } },
      ],
    ],
    margin: { left: M, right: M },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
    columnStyles: { 0: { cellWidth: 8 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    styles: { cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    didParseCell: (hookData) => {
      const isLast = hookData.row.index === (data.entries || []).length + 1;
      if (isLast) {
        hookData.cell.styles.fillColor = NAVY;
        hookData.cell.styles.textColor = ORANGE;
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - M, 290, { align: 'right' });
  }

  doc.save(`Cash-Ledger-${date}.pdf`);
}

export default function CashLedger({ user, onGlobalCompanyChange }) {
  const currentUser = getCurrentUser();
  const defaultCity = currentUser?.role === 'super_admin'
    ? '1e5962c6-33a7-460b-913e-9e08db46973a'
    : currentUser?.companyId;

  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const companyId = selectedCity === 'all' ? null : selectedCity;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (companyId) params.append('company_id', companyId);
      const res = await api.get(`/cash-ledger?${params}`);
      setData(res.data?.data || res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load cash ledger');
    } finally {
      setLoading(false);
    }
  }, [date, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCityChange = (city) => {
    setSelectedCity(city);
    if (onGlobalCompanyChange) onGlobalCompanyChange(city === 'all' ? '' : city);
  };

  const cityName = CITY_NAMES[companyId] || '';

  const hasEntries = data && data.entries && data.entries.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader
        icon={<BookOpen size={22} />}
        title="Cash Ledger"
        subtitle="Cash recoveries and deposits for a selected date"
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            {currentUser?.role === 'super_admin' && (
              <CityFilter value={selectedCity} onChange={handleCityChange} />
            )}
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 shadow-sm">
              <Calendar size={14} className="text-gray-400" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="border-none outline-none bg-transparent text-sm text-gray-700"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>
            {data && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => buildPdf(date, data, cityName)}
              >
                <Download size={14} className="mr-1" />
                PDF
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Loading...
        </div>
      )}

      {!loading && data && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {/* Header bar */}
          <div className="bg-navy px-5 py-3">
            <h3 className="text-white font-bold text-sm tracking-wide uppercase">
              Cash Ledger — {date}{cityName ? ` · ${cityName}` : ''}
            </h3>
          </div>

          {/* Opening balance row */}
          <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100">
            <span className="text-sm font-semibold text-blue-900">Opening Balance (Previous Cash Balance)</span>
            <span className={`text-sm font-bold ${data.opening_balance >= 0 ? 'text-navy' : 'text-red-600'}`}>
              {fmtPKR(data.opening_balance)}
            </span>
          </div>

          {!hasEntries ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm italic">
              No cash entries recorded for this date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
                    {['#', 'Description', 'Debit (In)', 'Credit (Out)', 'Balance'].map(h => (
                      <th key={h} className={`px-4 py-2.5 ${['Debit (In)', 'Credit (Out)', 'Balance'].includes(h) ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.sno} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{e.sno}</td>
                      <td className="px-4 py-2.5 text-navy">{e.description}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">
                        {e.debit ? fmtPKR(e.debit) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">
                        {e.credit ? fmtPKR(e.credit) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-bold ${e.running_balance >= 0 ? 'text-navy' : 'text-red-600'}`}>
                        {fmtPKR(e.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-navy text-white font-bold text-sm">
                    <td colSpan={2} className="px-4 py-3 font-bold">Closing Balance</td>
                    <td className="px-4 py-3 text-right text-green-300">{fmtPKR(data.total_in)}</td>
                    <td className="px-4 py-3 text-right text-red-300">{fmtPKR(data.total_out)}</td>
                    <td className="px-4 py-3 text-right text-orange-300 font-bold">{fmtPKR(data.closing_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
