import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { getCurrentUser } from '../services/api';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import DateRangeFilter from '../components/DateRangeFilter';
import { loadLogoDataUrl, drawPdfHeader } from '../utils/pdfBranding';

const toISODate = (d) => d.toISOString().split('T')[0];
const defaultFrom = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const defaultTo   = () => toISODate(new Date());
const fmtDate     = (s) => s ? new Date(s).toLocaleDateString('en-GB') : '—';
const fmtAmt      = (n) => `PKR ${Number(n || 0).toLocaleString()}`;

const TYPE_STYLES = {
  recovery: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Recovery' },
  payment:  { bg: 'bg-green-100',   text: 'text-green-700',   label: 'Payment'  },
  expense:  { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Expense'  },
  deposit:  { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Deposit'  },
};

const PAGE_SIZE = 30;

function Paginator({ page, total, size, onChange }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="px-6 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
      <span>Showing {(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
      <div className="flex gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /></button>
        <button onClick={() => onChange(Math.min(pages, page + 1))} disabled={page === pages} className="p-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export default function CashReport() {
  const toast   = useToast();
  const user    = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;

  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [fromDate, setFromDate] = useState(defaultFrom());
  const [toDate,   setToDate]   = useState(defaultTo());
  const [applied,  setApplied]  = useState({ from: defaultFrom(), to: defaultTo() });

  const [data,    setData]    = useState({ rows: [], total_in: 0, total_out: 0, net: 0 });
  const [loading, setLoading] = useState(false);

  const [typeFilter,   setTypeFilter]   = useState('all');
  const [personSearch, setPersonSearch] = useState('');
  const [page,         setPage]         = useState(1);

  const companyId = selectedCity === 'all' ? null : selectedCity;

  useEffect(() => { load(); }, [applied, selectedCity]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setPage(1);
    try {
      const params = {
        from: applied.from, to: applied.to,
        ...(companyId ? { company_id: companyId } : {}),
      };
      const r = await api.get('/reports/cash-complete', { params });
      setData(r.data.data || { rows: [], total_in: 0, total_out: 0, net: 0 });
    } catch {
      toast.error('Failed to load cash report.');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeApply = (from, to) => {
    setFromDate(from); setToDate(to); setApplied({ from, to });
  };

  const filtered = useMemo(() => {
    let rows = data.rows || [];
    if (typeFilter !== 'all') rows = rows.filter((r) => r.type === typeFilter);
    if (personSearch) rows = rows.filter((r) => r.person.toLowerCase().includes(personSearch.toLowerCase()) || r.customer.toLowerCase().includes(personSearch.toLowerCase()));
    return rows;
  }, [data.rows, typeFilter, personSearch]);

  const filteredIn  = filtered.reduce((s, r) => s + r.amount_in,  0);
  const filteredOut = filtered.reduce((s, r) => s + r.amount_out, 0);
  const filteredNet = filteredIn - filteredOut;

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Running balance (newest-first list, so reverse → compute → re-reverse)
  const withBalance = useMemo(() => {
    const asc = [...filtered].reverse();
    let bal = 0;
    const mapped = asc.map((r) => {
      bal += r.amount_in - r.amount_out;
      return { ...r, running: bal };
    });
    return mapped.reverse();
  }, [filtered]);

  const pagedWithBal = withBalance.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePdf = async () => {
    const doc = new jsPDF();
    const logo = await loadLogoDataUrl();
    drawPdfHeader(doc, logo, { title: 'Cash Report', subtitle: `${applied.from} to ${applied.to}` });
    autoTable(doc, {
      startY: 48,
      head: [['#', 'Date', 'Type', 'Person', 'Customer', 'Description', 'Cash In', 'Cash Out', 'Balance']],
      body: withBalance.map((r, i) => [
        i + 1,
        fmtDate(r.date),
        r.label,
        r.person,
        r.customer,
        r.description,
        r.amount_in  > 0 ? fmtAmt(r.amount_in)  : '—',
        r.amount_out > 0 ? fmtAmt(r.amount_out) : '—',
        fmtAmt(r.running),
      ]),
      margin: { left: 10, right: 10 },
      headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5 },
      styles: { cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 } },
    });
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 39, 58);
    [[`Total Cash In`,  fmtAmt(filteredIn)], [`Total Cash Out`, fmtAmt(filteredOut)], [`Net Cash`,       fmtAmt(filteredNet)]].forEach(([label, val]) => {
      doc.text(`${label}: ${val}`, 10, y); y += 6;
    });
    doc.save(`Cash-Report-${applied.from}-to-${applied.to}.pdf`);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Cash Report</h1>
          <p className="text-sm text-gray-500 mt-1">All cash-in and cash-out across recoveries, payments, expenses and deposits.</p>
        </div>
        <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
      </div>

      <DateRangeFilter from={applied.from} to={applied.to} onApply={handleDateRangeApply} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Cash In</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmtAmt(filteredIn)}</p>
          <p className="text-xs text-gray-400 mt-1">Recoveries + Payments</p>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Cash Out</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmtAmt(filteredOut)}</p>
          <p className="text-xs text-gray-400 mt-1">Expenses + Deposits</p>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Net Cash</p>
          <p className={`text-2xl font-bold mt-1 ${filteredNet >= 0 ? 'text-navy' : 'text-red-600'}`}>{fmtAmt(filteredNet)}</p>
          <p className="text-xs text-gray-400 mt-1">Cash In − Cash Out</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="all">— All Types —</option>
          <option value="recovery">Cash Recovery</option>
          <option value="payment">Cash Payment</option>
          <option value="expense">Cash Expense</option>
          <option value="deposit">Cash Deposit</option>
        </select>
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
          <Search size={14} className="text-gray-400" />
          <input
            value={personSearch}
            onChange={(e) => { setPersonSearch(e.target.value); setPage(1); }}
            placeholder="Search salesman / customer…"
            className="text-sm outline-none w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-wrap gap-3">
          <h3 className="font-semibold text-navy text-sm">
            All Cash Transactions ({filtered.length} rows)
          </h3>
          <button
            onClick={handlePdf}
            disabled={filtered.length === 0 || loading}
            className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <Download size={13} /> Export PDF
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={8} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Download} title="No cash transactions in this period" subtitle="Try a wider date range or a different filter" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    {['#', 'Date', 'Type', 'Salesman', 'Customer', 'Description', 'Cash In', 'Cash Out', 'Running Bal'].map((h, idx) => (
                      <th key={h} className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${idx >= 6 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedWithBal.map((r, i) => {
                    const s = TYPE_STYLES[r.type] || TYPE_STYLES.payment;
                    return (
                      <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                        </td>
                        <td className="px-4 py-3 font-medium text-navy">{r.person}</td>
                        <td className="px-4 py-3 text-gray-600">{r.customer}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate" title={r.description}>{r.description}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {r.amount_in > 0 ? fmtAmt(r.amount_in) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-500">
                          {r.amount_out > 0 ? fmtAmt(r.amount_out) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${r.running >= 0 ? 'text-navy' : 'text-red-600'}`}>
                          {fmtAmt(r.running)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginator page={page} total={filtered.length} size={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
