import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  TrendingUp, Package, CreditCard, Users, Truck, Wallet,
  Download, Search, ChevronLeft, ChevronRight, FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { getCurrentUser } from '../services/api';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import DateRangeFilter from '../components/DateRangeFilter';
import { loadLogoDataUrl, drawPdfHeader } from '../utils/pdfBranding';

const REPORT_TABS = [
  { key: 'sale',     label: 'Sale Report',        icon: TrendingUp },
  { key: 'purchase', label: 'Purchase Report',    icon: Package },
  { key: 'expense',  label: 'Expense Report',     icon: CreditCard },
  { key: 'customer', label: 'Customer Report',    icon: Users },
  { key: 'vendor',   label: 'Vendor Report',      icon: Truck },
  { key: 'recovery', label: 'Recovery & Cheque',  icon: Wallet },
];

const PAGE_SIZE = 25;

const toISODate = (d) => d.toISOString().split('T')[0];
const defaultFrom = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const defaultTo   = () => toISODate(new Date());
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-GB') : '—';
const fmtAmt  = (n) => `PKR ${Number(n || 0).toLocaleString()}`;

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

function SummaryCard({ label, value, sub, color = 'text-navy' }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

async function exportPdf(title, head, body, summary) {
  const doc = new jsPDF();
  const logo = await loadLogoDataUrl();
  drawPdfHeader(doc, logo, { title, subtitle: `Report — ${new Date().toLocaleDateString('en-GB')}` });
  autoTable(doc, {
    startY: 48,
    head: [head],
    body,
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    styles: { cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
  });
  if (summary) {
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 39, 58);
    summary.forEach(([label, val]) => {
      doc.text(`${label}: ${val}`, 14, y); y += 6;
    });
  }
  doc.save(`${title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────── SALE REPORT ───────────────────────
function SaleReport({ companyId, applied }) {
  const toast = useToast();
  const [data, setData] = useState({ rows: [], total_qty: 0, grand_total: 0 });
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [custFilter, setCustFilter] = useState('');
  const [salFilter,  setSalFilter]  = useState('');
  const [prodFilter, setProdFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const p = { ...(companyId ? { company_id: companyId } : {}) };
    Promise.all([
      api.get('/customers', { params: p }).then((r) => setCustomers(r.data.data || [])).catch(() => {}),
      api.get('/salesmen',  { params: p }).then((r) => setSalesmen(r.data.data  || [])).catch(() => {}),
    ]);
  }, [companyId]);

  useEffect(() => { load(); }, [applied, companyId]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setPage(1);
    try {
      const params = { from: applied.from, to: applied.to, ...(companyId ? { company_id: companyId } : {}), ...(custFilter ? { customer_id: custFilter } : {}), ...(salFilter ? { salesman_id: salFilter } : {}), ...(prodFilter ? { product: prodFilter } : {}) };
      const r = await api.get('/reports/sale-detail', { params });
      setData(r.data.data || { rows: [], total_qty: 0, grand_total: 0 });
    } catch { toast.error('Failed to load sale report.'); } finally { setLoading(false); }
  };

  const rows = data.rows || [];
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePdf = () => exportPdf(
    'Sale Report',
    ['#', 'Date', 'Invoice No', 'Customer', 'Salesman', 'Product', 'Unit', 'Qty', 'Rate', 'Amount'],
    rows.map((r, i) => [i + 1, fmtDate(r.date), r.order_number, r.customer, r.salesman, r.product_name, r.unit, r.quantity, fmtAmt(r.unit_price), fmtAmt(r.subtotal)]),
    [['Total Qty', data.total_qty], ['Grand Total', fmtAmt(data.grand_total)]]
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={custFilter} onChange={(e) => setCustFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="">— All Customers —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.shop_name || c.full_name}</option>)}
        </select>
        <select value={salFilter} onChange={(e) => setSalFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="">— All Salesmen —</option>
          {salesmen.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
          <Search size={14} className="text-gray-400" />
          <input value={prodFilter} onChange={(e) => setProdFilter(e.target.value)} placeholder="Filter product…" className="text-sm outline-none w-36" />
        </div>
        <button onClick={load} className="px-4 py-2 bg-navy text-white text-sm rounded-lg hover:bg-navy/90">Apply</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="Total Qty (Bags)" value={data.total_qty.toLocaleString()} />
        <SummaryCard label="Grand Total" value={fmtAmt(data.grand_total)} />
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-navy text-sm">Sale Detail ({rows.length} rows)</h3>
          <button onClick={handlePdf} disabled={rows.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <Download size={13} /> PDF
          </button>
        </div>
        {loading ? <SkeletonTable rows={6} cols={8} /> : rows.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No sales in this period" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  {['#','Date','Invoice No','Customer','Salesman','Product','Unit','Qty','Rate','Amount'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium text-navy">{r.order_number}</td>
                      <td className="px-4 py-3 text-gray-700">{r.customer}</td>
                      <td className="px-4 py-3 text-gray-600">{r.salesman}</td>
                      <td className="px-4 py-3 text-gray-700 font-medium">{r.product_name}</td>
                      <td className="px-4 py-3 text-gray-500">{r.unit}</td>
                      <td className="px-4 py-3 text-right font-semibold">{r.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{fmtAmt(r.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{fmtAmt(r.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator page={page} total={rows.length} size={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── PURCHASE REPORT ───────────────────────
function PurchaseReport({ companyId, applied }) {
  const toast = useToast();
  const [data, setData] = useState({ purchases: [], grand_total: 0 });
  const [loading, setLoading] = useState(false);
  const [vendorFilter, setVendorFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { load(); }, [applied, companyId]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setPage(1);
    try {
      const params = { from: applied.from, to: applied.to, ...(companyId ? { company_id: companyId } : {}) };
      const r = await api.get('/reports/purchases', { params });
      setData(r.data.data || { purchases: [], grand_total: 0 });
    } catch { toast.error('Failed to load purchase report.'); } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    let rows = data.purchases || [];
    if (vendorFilter) rows = rows.filter((p) => p.supplier_name?.toLowerCase().includes(vendorFilter.toLowerCase()));
    if (itemFilter) rows = rows.filter((p) => (p.items || []).some((it) => it.material_name?.toLowerCase().includes(itemFilter.toLowerCase())));
    return rows;
  }, [data.purchases, vendorFilter, itemFilter]);

  const filteredTotal = filtered.reduce((s, p) => s + p.total_amount, 0);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePdf = () => exportPdf(
    'Purchase Report',
    ['#', 'Date', 'Vendor', 'Items', 'Total Amount'],
    filtered.map((p, i) => [i + 1, fmtDate(p.date), p.supplier_name, (p.items || []).map((it) => `${it.material_name} (${it.quantity} ${it.unit})`).join(', '), p.total_amount > 0 ? fmtAmt(p.total_amount) : '—']),
    [['Total Purchases', fmtAmt(filteredTotal)]]
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
          <Search size={14} className="text-gray-400" />
          <input value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} placeholder="Filter vendor…" className="text-sm outline-none w-36" />
        </div>
        <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
          <Search size={14} className="text-gray-400" />
          <input value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Filter item…" className="text-sm outline-none w-36" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="Total Purchases" value={fmtAmt(filteredTotal)} />
        <SummaryCard label="Transactions" value={filtered.length.toString()} />
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-navy text-sm">Purchase Detail ({filtered.length} rows)</h3>
          <button onClick={handlePdf} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <Download size={13} /> PDF
          </button>
        </div>
        {loading ? <SkeletonTable rows={6} cols={4} /> : filtered.length === 0 ? (
          <EmptyState icon={Package} title="No purchases in this period" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  {['#','Date','Vendor','Items','Total Amount'].map((h) => (
                    <th key={h} className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paged.map((p, i) => (
                    <tr key={p.purchase_id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-5 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="px-5 py-3 font-medium text-navy">{p.supplier_name}</td>
                      <td className="px-5 py-3 text-gray-600 text-xs">{(p.items || []).map((it) => `${it.material_name} (${it.quantity} ${it.unit})`).join(', ')}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy">{p.total_amount > 0 ? fmtAmt(p.total_amount) : '—'}</td>
                    </tr>
                  ))}
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

// ─────────────────────── EXPENSE REPORT ───────────────────────
function ExpenseReport({ companyId, applied }) {
  const toast = useToast();
  const [data, setData] = useState({ expenses: [], total_amount: 0 });
  const [loading, setLoading] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => { load(); }, [applied, companyId]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setPage(1);
    try {
      const params = { from: applied.from, to: applied.to, ...(companyId ? { company_id: companyId } : {}) };
      const r = await api.get('/reports/expenses', { params });
      setData(r.data.data || { expenses: [], total_amount: 0 });
    } catch { toast.error('Failed to load expense report.'); } finally { setLoading(false); }
  };

  const categories = useMemo(() => [...new Set((data.expenses || []).map((e) => e.category).filter(Boolean))].sort(), [data.expenses]);

  const filtered = useMemo(() => {
    let rows = data.expenses || [];
    if (catFilter) rows = rows.filter((e) => e.category === catFilter);
    if (methodFilter !== 'all') rows = rows.filter((e) => e.method === methodFilter);
    return rows;
  }, [data.expenses, catFilter, methodFilter]);

  const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getPaidBy = (e) => {
    if (e.method === 'bank') return e.bank_accounts ? `${e.bank_accounts.account_name}` : 'Bank';
    if (e.method === 'pending') return 'Pending';
    return 'Cash';
  };

  const handlePdf = () => exportPdf(
    'Expense Report',
    ['#', 'Date', 'Category', 'Description', 'Vehicle/Employee', 'Paid By', 'Amount'],
    filtered.map((e, i) => [
      i + 1, fmtDate(e.expense_date), e.category, e.description || '—',
      e.drivers ? `${e.drivers.full_name}${e.drivers.car_number ? ` (${e.drivers.car_number})` : ''}` : (e.salesmen?.full_name || e.manufacturing_workers?.full_name || '—'),
      getPaidBy(e), fmtAmt(e.amount)
    ]),
    [['Total Expense', fmtAmt(filteredTotal)]]
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="">— All Categories —</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="all">— All Methods —</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SummaryCard label="Total Expense" value={fmtAmt(filteredTotal)} color="text-red-600" />
        <SummaryCard label="Transactions" value={filtered.length.toString()} />
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-navy text-sm">Expense Detail ({filtered.length} rows)</h3>
          <button onClick={handlePdf} disabled={filtered.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <Download size={13} /> PDF
          </button>
        </div>
        {loading ? <SkeletonTable rows={6} cols={6} /> : filtered.length === 0 ? (
          <EmptyState icon={CreditCard} title="No expenses in this period" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  {['#','Date','Category','Description','Vehicle / Employee','Paid By','Amount'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paged.map((e, i) => (
                    <tr key={e.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                      <td className="px-4 py-3 font-medium text-navy">{e.category}</td>
                      <td className="px-4 py-3 text-gray-600">{e.description || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {e.drivers ? `${e.drivers.full_name}${e.drivers.car_number ? ` (${e.drivers.car_number})` : ''}` : (e.salesmen?.full_name || e.manufacturing_workers?.full_name || '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{getPaidBy(e)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{fmtAmt(e.amount)}</td>
                    </tr>
                  ))}
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

// ─────────────────────── CUSTOMER REPORT ───────────────────────
function CustomerReport({ companyId, applied }) {
  const toast = useToast();
  const [view, setView] = useState('summary'); // 'summary' | 'ledger'
  const [summary, setSummary] = useState([]);
  const [loadingSum, setLoadingSum] = useState(false);
  const [selectedCust, setSelectedCust] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [salFilter, setSalFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  useEffect(() => { loadSummary(); }, [companyId]); // eslint-disable-line

  const loadSummary = async () => {
    setLoadingSum(true);
    try {
      const params = companyId ? { company_id: companyId } : {};
      const r = await api.get('/reports/customer-summary', { params });
      setSummary(r.data.data || []);
    } catch { toast.error('Failed to load customer summary.'); } finally { setLoadingSum(false); }
  };

  const loadLedger = async (cust) => {
    setSelectedCust(cust); setView('ledger'); setLedgerPage(1); setLoadingLedger(true);
    try {
      const params = { from: applied.from, to: applied.to };
      const r = await api.get(`/reports/customer-ledger/${cust.customer_id}`, { params });
      setLedger(r.data.data || []);
    } catch { toast.error('Failed to load ledger.'); } finally { setLoadingLedger(false); }
  };

  const salesmen = useMemo(() => [...new Set(summary.map((c) => c.salesman).filter((s) => s && s !== '—'))].sort(), [summary]);

  const filteredSum = useMemo(() => {
    let rows = summary;
    if (salFilter) rows = rows.filter((c) => c.salesman === salFilter);
    if (searchQ) rows = rows.filter((c) => (c.shop_name || c.full_name || '').toLowerCase().includes(searchQ.toLowerCase()));
    return rows;
  }, [summary, salFilter, searchQ]);

  const pagedSum = filteredSum.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalBalance = filteredSum.reduce((s, c) => s + Number(c.current_balance), 0);

  const pagedLedger = ledger.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE);

  const handleSumPdf = () => exportPdf(
    'Customer Summary',
    ['#', 'Customer', 'Salesman', 'Total Sales', 'Total Recovery', 'Balance'],
    filteredSum.map((c, i) => [i + 1, c.shop_name || c.full_name, c.salesman, fmtAmt(c.total_sales), fmtAmt(c.total_recovery), fmtAmt(c.current_balance)]),
    [['Total Outstanding', fmtAmt(totalBalance)]]
  );

  const handleLedgerPdf = () => exportPdf(
    `Ledger — ${selectedCust?.shop_name || selectedCust?.full_name}`,
    ['#', 'Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ledger.map((e, i) => [i + 1, fmtDate(e.created_at), e.description || e.entry_type, fmtAmt(e.debit), fmtAmt(e.credit), fmtAmt(e.running_balance)]),
    null
  );

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setView('summary')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'summary' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>All Customers</button>
        <button onClick={() => setView('ledger')} disabled={!selectedCust} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${view === 'ledger' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          {selectedCust ? `Ledger — ${selectedCust.shop_name || selectedCust.full_name}` : 'Single Ledger'}
        </button>
      </div>

      {view === 'summary' ? (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <select value={salFilter} onChange={(e) => { setSalFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
              <option value="">— All Salesmen —</option>
              {salesmen.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <Search size={14} className="text-gray-400" />
              <input value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setPage(1); }} placeholder="Search customer…" className="text-sm outline-none w-40" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <SummaryCard label="Total Customers" value={filteredSum.length.toString()} />
            <SummaryCard label="Total Outstanding" value={fmtAmt(totalBalance)} color="text-red-600" />
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-navy text-sm">Customer Summary</h3>
              <button onClick={handleSumPdf} disabled={filteredSum.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                <Download size={13} /> PDF
              </button>
            </div>
            {loadingSum ? <SkeletonTable rows={6} cols={5} /> : filteredSum.length === 0 ? (
              <EmptyState icon={Users} title="No customers found" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      {['#','Customer','Phone','Salesman','Total Sales','Total Recovery','Balance',''].map((h) => (
                        <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedSum.map((c, i) => (
                        <tr key={c.customer_id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-4 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-4 py-3 font-medium text-navy">{c.shop_name || c.full_name}{c.shop_name && c.full_name ? <span className="block text-xs text-gray-400 font-normal">{c.full_name}</span> : null}</td>
                          <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                          <td className="px-4 py-3 text-gray-600">{c.salesman}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmtAmt(c.total_sales)}</td>
                          <td className="px-4 py-3 text-right text-emerald-700">{fmtAmt(c.total_recovery)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${Number(c.current_balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtAmt(c.current_balance)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => loadLedger(c)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-navy/10 text-navy hover:bg-navy/20 transition-colors">Ledger</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={page} total={filteredSum.length} size={PAGE_SIZE} onChange={setPage} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-navy">{selectedCust?.shop_name || selectedCust?.full_name}</p>
              <p className="text-xs text-gray-400">{applied.from} to {applied.to}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleLedgerPdf} disabled={ledger.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 transition-colors disabled:opacity-40">
                <Download size={13} /> PDF
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loadingLedger ? <SkeletonTable rows={6} cols={5} /> : ledger.length === 0 ? (
              <EmptyState icon={FileText} title="No ledger entries in this period" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      {['#','Date','Description','Debit','Credit','Balance'].map((h, idx) => (
                        <th key={h} className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide ${idx >= 3 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedLedger.map((e, i) => (
                        <tr key={e.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-4 py-3 text-gray-400">{(ledgerPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                          <td className="px-4 py-3 text-gray-700">{e.description || e.entry_type}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-medium">{Number(e.debit) > 0 ? fmtAmt(e.debit) : '—'}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">{Number(e.credit) > 0 ? fmtAmt(e.credit) : '—'}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${Number(e.running_balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtAmt(e.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={ledgerPage} total={ledger.length} size={PAGE_SIZE} onChange={setLedgerPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────── VENDOR REPORT ───────────────────────
function VendorReport({ companyId, applied }) {
  const toast = useToast();
  const [view, setView] = useState('summary');
  const [summary, setSummary] = useState([]);
  const [loadingSum, setLoadingSum] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  useEffect(() => { loadSummary(); }, [companyId]); // eslint-disable-line

  const loadSummary = async () => {
    setLoadingSum(true);
    try {
      const params = companyId ? { company_id: companyId } : {};
      const r = await api.get('/reports/vendor-summary', { params });
      setSummary(r.data.data || []);
    } catch { toast.error('Failed to load vendor summary.'); } finally { setLoadingSum(false); }
  };

  const loadLedger = async (vendor) => {
    setSelectedVendor(vendor); setView('ledger'); setLedgerPage(1); setLoadingLedger(true);
    try {
      const params = { vendor: vendor.supplier_name, from: applied.from, to: applied.to, ...(companyId ? { company_id: companyId } : {}) };
      const r = await api.get('/reports/vendor-ledger', { params });
      setLedger(r.data.data || []);
    } catch { toast.error('Failed to load vendor ledger.'); } finally { setLoadingLedger(false); }
  };

  const filteredSum = useMemo(() => {
    if (!searchQ) return summary;
    return summary.filter((v) => v.supplier_name.toLowerCase().includes(searchQ.toLowerCase()));
  }, [summary, searchQ]);

  const pagedSum = filteredSum.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedLedger = ledger.slice((ledgerPage - 1) * PAGE_SIZE, ledgerPage * PAGE_SIZE);
  const totalPurchases = filteredSum.reduce((s, v) => s + v.total_purchases, 0);

  const handleSumPdf = () => exportPdf(
    'Vendor Summary',
    ['#', 'Vendor', 'Transactions', 'Total Purchases'],
    filteredSum.map((v, i) => [i + 1, v.supplier_name, v.transaction_count, fmtAmt(v.total_purchases)]),
    [['Grand Total', fmtAmt(totalPurchases)]]
  );

  const handleLedgerPdf = () => exportPdf(
    `Vendor Ledger — ${selectedVendor?.supplier_name}`,
    ['#', 'Date', 'Description', 'Amount', 'Running Total'],
    ledger.map((e, i) => [i + 1, fmtDate(e.date), e.description, fmtAmt(e.debit), fmtAmt(e.running_balance)]),
    null
  );

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setView('summary')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'summary' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>All Vendors</button>
        <button onClick={() => setView('ledger')} disabled={!selectedVendor} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${view === 'ledger' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
          {selectedVendor ? `Ledger — ${selectedVendor.supplier_name}` : 'Single Ledger'}
        </button>
      </div>

      {view === 'summary' ? (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <Search size={14} className="text-gray-400" />
              <input value={searchQ} onChange={(e) => { setSearchQ(e.target.value); setPage(1); }} placeholder="Search vendor…" className="text-sm outline-none w-40" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <SummaryCard label="Total Vendors" value={filteredSum.length.toString()} />
            <SummaryCard label="Total Purchases" value={fmtAmt(totalPurchases)} />
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-navy text-sm">Vendor Summary</h3>
              <button onClick={handleSumPdf} disabled={filteredSum.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                <Download size={13} /> PDF
              </button>
            </div>
            {loadingSum ? <SkeletonTable rows={5} cols={3} /> : filteredSum.length === 0 ? (
              <EmptyState icon={Truck} title="No vendors found" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      {['#','Vendor','Transactions','Total Purchases',''].map((h) => (
                        <th key={h} className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedSum.map((v, i) => (
                        <tr key={v.supplier_name} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-5 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-5 py-3 font-medium text-navy">{v.supplier_name}</td>
                          <td className="px-5 py-3 text-gray-600">{v.transaction_count}</td>
                          <td className="px-5 py-3 text-right font-semibold text-navy">{fmtAmt(v.total_purchases)}</td>
                          <td className="px-5 py-3">
                            <button onClick={() => loadLedger(v)} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-navy/10 text-navy hover:bg-navy/20 transition-colors">Ledger</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={page} total={filteredSum.length} size={PAGE_SIZE} onChange={setPage} />
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex justify-between items-center">
            <div>
              <p className="font-semibold text-navy">{selectedVendor?.supplier_name}</p>
              <p className="text-xs text-gray-400">{applied.from} to {applied.to}</p>
            </div>
            <button onClick={handleLedgerPdf} disabled={ledger.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 transition-colors disabled:opacity-40">
              <Download size={13} /> PDF
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loadingLedger ? <SkeletonTable rows={5} cols={4} /> : ledger.length === 0 ? (
              <EmptyState icon={FileText} title="No purchases in this period for this vendor" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      {['#','Date','Description','Amount','Running Total'].map((h, idx) => (
                        <th key={h} className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide ${idx >= 3 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedLedger.map((e, i) => (
                        <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-4 py-3 text-gray-400">{(ledgerPage - 1) * PAGE_SIZE + i + 1}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="px-4 py-3 text-gray-700">{e.description}</td>
                          <td className="px-4 py-3 text-right font-semibold text-navy">{fmtAmt(e.debit)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmtAmt(e.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginator page={ledgerPage} total={ledger.length} size={PAGE_SIZE} onChange={setLedgerPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────── RECOVERY & CHEQUE REPORT ───────────────────────
function RecoveryReport({ companyId, applied }) {
  const toast = useToast();
  const [data, setData] = useState({ rows: [], total_cleared: 0, total_pending: 0 });
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [custFilter, setCustFilter] = useState('');
  const [salFilter, setSalFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const p = { ...(companyId ? { company_id: companyId } : {}) };
    Promise.all([
      api.get('/customers', { params: p }).then((r) => setCustomers(r.data.data || [])).catch(() => {}),
      api.get('/salesmen',  { params: p }).then((r) => setSalesmen(r.data.data  || [])).catch(() => {}),
    ]);
  }, [companyId]);

  useEffect(() => { load(); }, [applied, companyId]); // eslint-disable-line

  const load = async () => {
    setLoading(true); setPage(1);
    try {
      const params = {
        from: applied.from, to: applied.to,
        ...(companyId ? { company_id: companyId } : {}),
        ...(custFilter ? { customer_id: custFilter } : {}),
        ...(salFilter  ? { salesman_id: salFilter }  : {}),
        ...(methodFilter !== 'all' ? { method: methodFilter } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      };
      const r = await api.get('/reports/recovery', { params });
      setData(r.data.data || { rows: [], total_cleared: 0, total_pending: 0 });
    } catch { toast.error('Failed to load recovery report.'); } finally { setLoading(false); }
  };

  const rows = data.rows || [];
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePdf = () => exportPdf(
    'Recovery & Cheque Report',
    ['#', 'Date', 'Customer', 'Salesman', 'Method', 'Deposit To', 'Cheque No', 'Cheque Date', 'Status', 'Amount'],
    rows.map((r, i) => [i + 1, fmtDate(r.date), r.customer, r.salesman, r.method, r.deposit_to, r.cheque_number, r.cheque_date, r.status, fmtAmt(r.amount)]),
    [['Total Cleared', fmtAmt(data.total_cleared)], ['Total Pending', fmtAmt(data.total_pending)]]
  );

  const STATUS_COLORS = { approved: 'bg-green-100 text-green-700', cleared: 'bg-emerald-100 text-emerald-700', pending: 'bg-orange/15 text-orange', rejected: 'bg-red-100 text-red-700' };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={custFilter} onChange={(e) => setCustFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="">— All Customers —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.shop_name || c.full_name}</option>)}
        </select>
        <select value={salFilter} onChange={(e) => setSalFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="">— All Salesmen —</option>
          {salesmen.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="all">— All Methods —</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white">
          <option value="all">— All Statuses —</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="cleared">Cleared</option>
          <option value="rejected">Rejected</option>
        </select>
        <button onClick={load} className="px-4 py-2 bg-navy text-white text-sm rounded-lg hover:bg-navy/90">Apply</button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <SummaryCard label="Total Records" value={rows.length.toString()} />
        <SummaryCard label="Total Cleared" value={fmtAmt(data.total_cleared)} color="text-emerald-600" />
        <SummaryCard label="Total Pending" value={fmtAmt(data.total_pending)} color="text-orange" />
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-semibold text-navy text-sm">Recovery & Cheque Detail ({rows.length} rows)</h3>
          <button onClick={handlePdf} disabled={rows.length === 0} className="flex items-center gap-1.5 text-navy hover:bg-navy-chip/40 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <Download size={13} /> PDF
          </button>
        </div>
        {loading ? <SkeletonTable rows={6} cols={8} /> : rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No recovery records in this period" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  {['#','Date','Customer','Salesman','Method','Deposit To','Cheque No','Cheque Date','Status','Amount'].map((h) => (
                    <th key={h} className="px-3 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr key={`${r.source}-${r.id}`} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/70 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-3 py-3 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-3 py-3 font-medium text-navy">{r.customer}</td>
                      <td className="px-3 py-3 text-gray-600">{r.salesman}</td>
                      <td className="px-3 py-3"><span className="capitalize text-xs font-medium bg-navy/10 text-navy px-2 py-0.5 rounded-full">{r.method}</span></td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{r.deposit_to}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{r.cheque_number}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{r.cheque_date}</td>
                      <td className="px-3 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span></td>
                      <td className="px-3 py-3 text-right font-semibold text-navy">{fmtAmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginator page={page} total={rows.length} size={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── MAIN PAGE ───────────────────────
export default function Reports() {
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [reportTab, setReportTab] = useState('sale');
  const [fromDate, setFromDate] = useState(defaultFrom());
  const [toDate,   setToDate]   = useState(defaultTo());
  const [applied,  setApplied]  = useState({ from: defaultFrom(), to: defaultTo() });

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  const handleDateRangeApply = (from, to) => {
    setFromDate(from); setToDate(to); setApplied({ from, to });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Sale, Purchase, Expense, Customer, Vendor and Recovery reports.</p>
        </div>
        <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
      </div>

      <DateRangeFilter from={applied.from} to={applied.to} onApply={handleDateRangeApply} />

      <div className="flex flex-wrap gap-2 mb-6">
        {REPORT_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setReportTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                reportTab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {reportTab === 'sale'     && <SaleReport     companyId={companyFilter} applied={applied} />}
      {reportTab === 'purchase' && <PurchaseReport  companyId={companyFilter} applied={applied} />}
      {reportTab === 'expense'  && <ExpenseReport   companyId={companyFilter} applied={applied} />}
      {reportTab === 'customer' && <CustomerReport  companyId={companyFilter} applied={applied} />}
      {reportTab === 'vendor'   && <VendorReport    companyId={companyFilter} applied={applied} />}
      {reportTab === 'recovery' && <RecoveryReport  companyId={companyFilter} applied={applied} />}
    </div>
  );
}
