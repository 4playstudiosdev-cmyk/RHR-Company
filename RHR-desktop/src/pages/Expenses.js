import React, { useEffect, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Wallet, Plus, Download, Trash2, Receipt, Camera, Image as ImageIcon, X, Users, List, UserPlus, ChevronDown, Search } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import DateRangeFilter from '../components/DateRangeFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const EXPENSE_CATEGORIES = [
  'Fuel', 'Vehicle Maintenance', 'Office Supplies', 'Utilities', 'Rent',
  'Salaries', 'Transport', 'Raw Material Purchase', 'Equipment', 'Other'
];

// Every expense can be tied to a person: a driver, a salesman, or one of the company's
// "expense accounts" (a shop, a mechanic, "Home expense" …). The Add Expense form has one
// Person / Account picker holding all three groups; its value is "<kind>:<id>".
const personKey = (kind, id) => (id ? `${kind}:${id}` : '');
// The person an already-saved expense belongs to, as { key, name, group } (or null).
const personOf = (e) => {
  if (e.drivers) return { key: personKey('driver', e.driver_id), name: e.drivers.full_name, group: 'Driver' };
  if (e.salesmen) return { key: personKey('salesman', e.salesman_id), name: e.salesmen.full_name, group: 'Salesman' };
  if (e.employees) return { key: personKey('employee', e.employee_id), name: e.employees.full_name, group: 'Employee' };
  if (e.expense_accounts) return { key: personKey('account', e.expense_account_id), name: e.expense_accounts.name, group: 'Account' };
  if (e.manufacturing_workers) return { key: personKey('worker', e.manufacturing_worker_id), name: e.manufacturing_workers.full_name, group: 'Worker' };
  return null;
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const todayISO = () => new Date().toISOString().split('T')[0];
// Defaults to the current calendar month (same range the old month-only
// picker always started on), but as real from/to dates now — so the
// native date picker opens on a day, like Reports.js's date filters,
// instead of only letting a whole month be picked at once.
const monthStartISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const EMPTY_FORM = {
  category: EXPENSE_CATEGORIES[0], amount: '', description: '', expense_date: todayISO(),
  method: 'cash', bank_account_id: '', person: '',
  supplier_id: '', splitPayment: false, cashAmount: '', onlineAmount: '',
};

export default function Expenses() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [expenses, setExpenses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [driversList, setDriversList] = useState([]);
  const [salesmenList, setSalesmenList] = useState([]);
  const [workersList, setWorkersList] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [tab, setTab] = useState('all');           // 'all' | 'person'
  const [personFilter, setPersonFilter] = useState('');   // person key shown in "By Person"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // Optional photo of the bill: picked here, uploaded when the expense is
  // saved, and kept on the expense (see receipt_url) for "View Photo".
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [viewReceipt, setViewReceipt] = useState(null);
  const receiptInputRef = useRef(null);
  const personDropdownRef = useRef(null);
  const [personSearch, setPersonSearch] = useState('');
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, dateFrom, dateTo]);

  useEffect(() => {
    const loadBankAccounts = async () => {
      try {
        const companyFilter = selectedCity === 'all' ? null : selectedCity;
        const data = companyFilter
          ? (await api.get('/bank/accounts', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/bank/accounts');
        setBankAccounts(data);
      } catch (err) {
        setBankAccounts([]);
      }
    };
    loadBankAccounts();
  }, [selectedCity]);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const companyFilter = selectedCity === 'all' ? null : selectedCity;
        const data = companyFilter
          ? (await api.get('/drivers', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/drivers');
        setDriversList(data);
      } catch (err) {
        setDriversList([]);
      }
    };
    loadDrivers();
  }, [selectedCity]);

  // Powers the "Employee" picker that appears when Category = Salaries —
  // every driver, salesman and Manufacturing Worker in one list, so a
  // salary paid to any of them lands in this same Expenses record.
  useEffect(() => {
    const companyFilter = selectedCity === 'all' ? null : selectedCity;
    const loadSalesmen = async () => {
      try {
        const data = companyFilter
          ? (await api.get('/salesmen', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/salesmen');
        setSalesmenList(data);
      } catch (err) {
        setSalesmenList([]);
      }
    };
    const loadWorkers = async () => {
      try {
        const data = companyFilter
          ? (await api.get('/manufacturing/workers', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/manufacturing/workers');
        setWorkersList(data);
      } catch (err) {
        setWorkersList([]);
      }
    };
    loadSalesmen();
    loadWorkers();
  }, [selectedCity]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const companyFilter = selectedCity === 'all' ? null : selectedCity;
        const data = companyFilter
          ? (await api.get('/employees', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/employees');
        setEmployeesList(data);
      } catch (err) {
        setEmployeesList([]);
      }
    };
    loadEmployees();
  }, [selectedCity]);

  // Powers the "Vendor" picker shown when Category = Raw Material Purchase.
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const companyFilter = selectedCity === 'all' ? null : selectedCity;
        const data = companyFilter
          ? (await api.get('/suppliers', { params: { company_id: companyFilter } })).data.data || []
          : await fetchAllCities('/suppliers');
        setSuppliersList(data);
      } catch (err) {
        setSuppliersList([]);
      }
    };
    loadSuppliers();
  }, [selectedCity]);

  const loadAccounts = async () => {
    try {
      const companyFilter = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      setAccountsList((await api.get('/expenses/accounts', { params: { company_id: companyFilter } })).data.data || []);
    } catch (err) {
      setAccountsList([]);
    }
  };
  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const handleAddAccount = async () => {
    const name = window.prompt('New expense account name (a shop, mechanic, person …):', '');
    if (!name || !name.trim()) return;
    try {
      const res = await api.post('/expenses/accounts', {
        name: name.trim(),
        company_id: selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity,
      });
      await loadAccounts();
      if (res.data.data?.id) setForm((f) => ({ ...f, person: personKey('account', res.data.data.id) }));
      toast.success(res.data.message || 'Account added.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add the account.');
    }
  };

  useEffect(() => {
    const onOutside = (e) => { if (personDropdownRef.current && !personDropdownRef.current.contains(e.target)) setPersonDropdownOpen(false); };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const personLabelFor = (key) => {
    if (!key) return '';
    const [kind, id] = key.split(':');
    if (kind === 'driver')   { const d = driversList.find((x) => x.id === id);    return d ? d.full_name + (d.car_number ? ` — ${d.car_number}` : '') : ''; }
    if (kind === 'salesman') { const s = salesmenList.find((x) => x.id === id);   return s?.full_name || ''; }
    if (kind === 'employee') { const e = employeesList.find((x) => x.id === id);  return e ? e.full_name + (e.city ? ` — ${e.city}` : '') : ''; }
    if (kind === 'account')  { const a = accountsList.find((x) => x.id === id);   return a?.name || ''; }
    if (kind === 'worker')   { const w = workersList.find((x) => x.id === id);    return w?.full_name || ''; }
    return '';
  };

  const loadExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { from: dateFrom, to: dateTo, company_id: companyFilter };
      const data = companyFilter
        ? (await api.get('/expenses', { params })).data.data || []
        : await fetchAllCities('/expenses', { from: dateFrom, to: dateTo });
      setExpenses(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  const isSplit = form.category === 'Raw Material Purchase' && form.splitPayment;
  const splitCash = Number(form.cashAmount) || 0;
  const splitOnline = Number(form.onlineAmount) || 0;
  const splitTotal = splitCash + splitOnline;

  const pickReceipt = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a JPG, PNG or WebP photo.');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo is too large — max 10 MB.');
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const clearReceipt = () => {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(null);
    setReceiptPreview('');
    if (receiptInputRef.current) receiptInputRef.current.value = '';
  };

  const uploadReceipt = async (file) => {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await api.post('/storage/upload', {
      bucket: 'expense-receipts',
      fileName: file.name,
      fileBase64: base64,
      mimeType: file.type,
    });
    return res.data.data.url;
  };

  // "<kind>:<id>" -> the matching column of the expense row
  const personFields = (value) => {
    const [kind, id] = (value || '').split(':');
    return {
      driver_id: kind === 'driver' ? id : null,
      salesman_id: kind === 'salesman' ? id : null,
      expense_account_id: kind === 'account' ? id : null,
      manufacturing_worker_id: kind === 'worker' ? id : null,
      employee_id: kind === 'employee' ? id : null,
    };
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error('Description is required.');
      return;
    }
    if (isSplit) {
      if (splitCash <= 0 && splitOnline <= 0) {
        toast.error('Enter a cash amount, an online amount, or both.');
        return;
      }
      if (splitOnline > 0 && !form.bank_account_id) {
        toast.error('Select a bank account for the online portion.');
        return;
      }
    } else {
      if (!form.amount || Number(form.amount) <= 0) {
        toast.error('Amount is required.');
        return;
      }
      if (form.method === 'bank' && !form.bank_account_id) {
        toast.error('Select a bank account.');
        return;
      }
    }
    setSaving(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      // Upload the photo first so the expense is saved with its link.
      const receipt_url = receiptFile ? await uploadReceipt(receiptFile) : undefined;
      const baseRow = {
        category: form.category,
        expense_date: form.expense_date,
        supplier_id: form.supplier_id || null,
        company_id: targetCompanyId,
        receipt_url,
        ...personFields(form.person),
      };
      if (isSplit) {
        // One row, method: 'split' — carries both the cash and bank
        // portions together instead of two separate expense entries. Bank
        // → Transactions reads bank_amount off this same row for its view.
        await api.post('/expenses', {
          ...baseRow,
          description: form.description,
          amount: splitTotal,
          method: 'split',
          cash_amount: splitCash,
          bank_amount: splitOnline,
          bank_account_id: splitOnline > 0 ? form.bank_account_id : null,
        });
      } else {
        await api.post('/expenses', { ...form, ...baseRow, amount: Number(form.amount) });
      }
      toast.success(receipt_url ? 'Expense recorded with photo.' : 'Expense recorded.');
      setForm({ ...EMPTY_FORM, expense_date: form.expense_date });
      clearReceipt();
      loadExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete this expense — "${expense.description}" (PKR ${Number(expense.amount).toLocaleString()})?`)) return;
    setDeletingId(expense.id);
    try {
      await api.delete(`/expenses/${expense.id}`);
      toast.success('Expense deleted.');
      loadExpenses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete expense.');
    } finally {
      setDeletingId(null);
    }
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Whichever employee this expense is tied to — a Fuel/Vehicle
  // Maintenance expense always carries a driver (the vehicle operator);
  // a Salaries expense may instead carry a salesman or Manufacturing
  // Worker, see the Employee picker above.
  const getEmployeeLabel = (e) => {
    if (e.drivers) return `${e.drivers.full_name}${e.drivers.car_number ? ` — ${e.drivers.car_number}` : ''}`;
    if (e.salesmen) return e.salesmen.full_name;
    if (e.employees) return `${e.employees.full_name}${e.employees.city ? ` — ${e.employees.city}` : ''}`;
    if (e.expense_accounts) return e.expense_accounts.name;
    if (e.manufacturing_workers) return e.manufacturing_workers.full_name;
    return '—';
  };

  // ── By Person: totals per person over the chosen dates, and the picked person's
  // month-by-month totals + running ledger ──
  const personTotals = (() => {
    const map = new Map();
    expenses.forEach((e) => {
      const who = personOf(e);
      if (!who) return;
      const row = map.get(who.key) || { ...who, total: 0, count: 0 };
      row.total += Number(e.amount);
      row.count += 1;
      map.set(who.key, row);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  })();
  const unassignedTotal = expenses.filter((e) => !personOf(e)).reduce((n, e) => n + Number(e.amount), 0);
  const selectedPerson = personTotals.find((p) => p.key === personFilter) || null;
  // oldest first so the running total reads like a ledger
  // (with no person picked it is every expense in the period — the default "All" view)
  const personEntries = (selectedPerson ? expenses.filter((e) => personOf(e)?.key === personFilter) : [...expenses])
        .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)) || String(a.created_at).localeCompare(String(b.created_at)));
  const personMonths = (() => {
    const map = new Map();
    personEntries.forEach((e) => {
      const ym = String(e.expense_date).slice(0, 7);
      const row = map.get(ym) || { ym, total: 0, count: 0 };
      row.total += Number(e.amount);
      row.count += 1;
      map.set(ym, row);
    });
    return [...map.values()].sort((a, b) => b.ym.localeCompare(a.ym));
  })();

  const getPaidFromLabel = (e) => {
    if (e.method === 'split') {
      return `Cash Rs ${Number(e.cash_amount || 0).toLocaleString()} + Bank Rs ${Number(e.bank_amount || 0).toLocaleString()}${e.bank_accounts ? ` — ${e.bank_accounts.account_name}` : ''}`;
    }
    if (e.method === 'bank') return `Bank${e.bank_accounts ? ` — ${e.bank_accounts.account_name}` : ''}`;
    return 'Cash';
  };

  const exportToPdf = () => {
    if (expenses.length === 0) { toast.error('No expenses to export.'); return; }
    const doc = new jsPDF();
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
    doc.text('EXPENSE REPORT', PAGE_W - M, 26, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Period: ${dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : "All Time"}`, PAGE_W - M, 34, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, PAGE_W - M, 40, { align: 'right' });

    doc.setDrawColor(30, 30, 40);
    doc.setLineWidth(0.6);
    doc.line(M, 46, PAGE_W - M, 46);

    const rows = expenses.map((e) => [
      new Date(e.expense_date).toLocaleDateString('en-GB'),
      e.category,
      e.description,
      getEmployeeLabel(e),
      getPaidFromLabel(e),
      `Rs ${Number(e.amount).toLocaleString()}`
    ]);

    autoTable(doc, {
      startY: 56,
      head: [['Date', 'Category', 'Description', 'Person', 'Paid From', 'Amount']],
      body: rows,
      margin: { left: M, right: M },
      headStyles: { fillColor: [27, 39, 58], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10, textColor: [30, 30, 30] },
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
      styles: { cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
      foot: [['', '', '', '', 'TOTAL', `Rs ${totalExpenses.toLocaleString()}`]],
      footStyles: { fillColor: [27, 39, 58], textColor: [230, 126, 34], fontStyle: 'bold', fontSize: 10 }
    });

    doc.save(`Expense-Report-${dateFrom}_to_${dateTo}.pdf`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Company Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Track all company expenses by date range.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            defaultPreset="This Month"
            onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
          />
          <Button variant="primary" onClick={exportToPdf} className="flex items-center gap-2">
            <Download size={15} /> Export PDF
          </Button>
        </div>
      </div>

      <div className="bg-navy rounded-2xl px-6 py-5 mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-blue-200/70 text-xs font-semibold uppercase tracking-wide">Total Expenses — {dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'All Time'}</p>
          <p className="text-white text-3xl font-bold mt-1">PKR {totalExpenses.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-blue-200/70 text-xs font-semibold uppercase tracking-wide">Total Entries</p>
          <p className="text-orange text-3xl font-bold mt-1">{expenses.length}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      <div className="flex gap-2 mb-5">
        {[['all', 'All Expenses', List], ['person', 'By Person', Users]].map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === id ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:text-navy'}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'person' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-5">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-navy text-sm">Who the money went to — {dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : 'all time'}</h3>
              <p className="text-xs text-gray-500 mt-0.5">Showing everyone together — pick a person to see only their expenses month by month and as a ledger. Use “All Time” in the date filter above for their full history.</p>
            </div>
            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy bg-white min-w-[220px]"
            >
              <option value="">All</option>
              {['Driver', 'Salesman', 'Employee', 'Account', 'Worker'].map((g) => {
                const list = personTotals.filter((p) => p.group === g);
                return list.length ? (
                  <optgroup key={g} label={g === 'Account' ? 'Expense Accounts' : g === 'Worker' ? 'Manufacturing Workers' : g === 'Employee' ? 'HRM Employees' : g + 's'}>
                    {list.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </div>

          {personTotals.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No person-wise expenses in this period yet. Choose a Person / Account when adding an expense.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {personTotals.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPersonFilter(p.key)}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${personFilter === p.key ? 'border-navy bg-navy-chip' : 'border-gray-200 hover:border-navy/40 bg-white'}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{p.group}</p>
                  <p className="font-semibold text-navy text-sm truncate">{p.name}</p>
                  <p className="text-red-600 font-bold mt-1">PKR {p.total.toLocaleString()}</p>
                  <p className="text-[11px] text-gray-400">{p.count} {p.count === 1 ? 'entry' : 'entries'}</p>
                </button>
              ))}
            </div>
          )}
          {unassignedTotal > 0 && (
            <p className="text-xs text-gray-400 mt-3">General expenses (no person chosen): PKR {unassignedTotal.toLocaleString()}</p>
          )}

          {expenses.length > 0 && (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4">
                <div className="bg-navy rounded-xl px-5 py-4 mb-4">
                  <p className="text-blue-200/70 text-xs font-semibold uppercase tracking-wide">{selectedPerson ? selectedPerson.name : 'All'}</p>
                  <p className="text-white text-2xl font-bold mt-1">PKR {(selectedPerson ? selectedPerson.total : totalExpenses).toLocaleString()}</p>
                  <p className="text-blue-200/70 text-xs mt-1">{personEntries.length} {personEntries.length === 1 ? 'entry' : 'entries'} in this period</p>
                </div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Month by month</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {personMonths.map((m) => (
                      <tr key={m.ym} className="border-b border-gray-100">
                        <td className="py-2 text-gray-700">{monthLabel(m.ym)}<span className="block text-[11px] text-gray-400">{m.count} {m.count === 1 ? 'entry' : 'entries'}</span></td>
                        <td className="py-2 text-right font-semibold text-red-600">PKR {m.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lg:col-span-8 overflow-x-auto">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Ledger</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Category</th>
                      {!selectedPerson && <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Person</th>}
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Description</th>
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide">Paid From</th>
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                      <th className="px-4 py-2.5 font-semibold text-xs uppercase tracking-wide text-right">Running Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let run = 0;
                      return personEntries.map((e) => {
                        run += Number(e.amount);
                        return (
                          <tr key={e.id} className="border-b border-gray-50">
                            <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{new Date(e.expense_date).toLocaleDateString('en-GB')}</td>
                            <td className="px-4 py-2.5"><span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-navy-chip text-navy">{e.category}</span></td>
                            {!selectedPerson && <td className="px-4 py-2.5 text-gray-600 text-xs">{personOf(e)?.name || '—'}</td>}
                            <td className="px-4 py-2.5 text-gray-700">{e.description}</td>
                            <td className="px-4 py-2.5 text-gray-600 text-xs">{getPaidFromLabel(e)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-red-600">PKR {Number(e.amount).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">PKR {run.toLocaleString()}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'all' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-fit lg:sticky lg:top-5 self-start">
          <h3 className="font-semibold text-navy text-sm mb-4 flex items-center gap-2"><Plus size={15} /> Add Expense</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-gray-700 mb-1">
                <span>Person / Account</span>
                <button type="button" onClick={handleAddAccount} className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy hover:underline">
                  <UserPlus size={12} /> New account
                </button>
              </label>
              <div className=”relative” ref={personDropdownRef}>
                <button
                  type=”button”
                  onClick={() => { setPersonDropdownOpen((o) => !o); setPersonSearch(''); }}
                  className=”w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white”
                >
                  <span className={form.person ? 'text-gray-800 truncate' : 'text-gray-400'}>
                    {form.person ? (personLabelFor(form.person) || '—') : '— General / not person-specific —'}
                  </span>
                  <ChevronDown size={14} className=”text-gray-400 flex-shrink-0” />
                </button>
                {personDropdownOpen && (
                  <div className=”absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden”>
                    <div className=”p-2 border-b border-gray-100 flex items-center gap-2”>
                      <Search size={13} className=”text-gray-400 flex-shrink-0” />
                      <input
                        type=”text”
                        value={personSearch}
                        onChange={(e) => setPersonSearch(e.target.value)}
                        placeholder=”Search...”
                        autoFocus
                        className=”flex-1 text-sm outline-none bg-transparent placeholder-gray-400”
                      />
                    </div>
                    <div className=”max-h-56 overflow-y-auto”>
                      {(!personSearch || 'general'.includes(personSearch.toLowerCase())) && (
                        <button type=”button”
                          onClick={() => { setForm({ ...form, person: '' }); setPersonDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${!form.person ? 'bg-navy-chip font-semibold text-navy' : 'text-gray-400 italic'}`}>
                          — General / not person-specific —
                        </button>
                      )}
                      {[
                        { label: 'Drivers', items: driversList.map((d) => ({ key: personKey('driver', d.id), label: d.full_name + (d.car_number ? ` — ${d.car_number}` : '') })) },
                        { label: 'Salesmen', items: salesmenList.map((s) => ({ key: personKey('salesman', s.id), label: s.full_name })) },
                        { label: 'HRM Employees', items: employeesList.map((emp) => ({ key: personKey('employee', emp.id), label: emp.full_name + (emp.city ? ` — ${emp.city}` : '') })) },
                        { label: 'Expense Accounts', items: accountsList.map((a) => ({ key: personKey('account', a.id), label: a.name })) },
                        ...(form.category === 'Salaries' ? [{ label: 'Manufacturing Workers', items: workersList.map((w) => ({ key: personKey('worker', w.id), label: w.full_name })) }] : []),
                      ].map(({ label, items }) => {
                        const q = personSearch.toLowerCase();
                        const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q) || label.toLowerCase().includes(q)) : items;
                        if (!filtered.length) return null;
                        return (
                          <div key={label}>
                            <p className=”px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50 border-t border-gray-100”>{label}</p>
                            {filtered.map((item) => (
                              <button key={item.key} type=”button”
                                onClick={() => { setForm({ ...form, person: item.key }); setPersonDropdownOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${form.person === item.key ? 'bg-navy-chip font-semibold text-navy' : 'text-gray-800'}`}>
                                {item.label}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {accountsList.length === 0 && (
                <p className=”text-xs text-gray-400 mt-1”>No expense accounts yet — add one with “New account”.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({
                  ...form,
                  category: e.target.value,
                  person: e.target.value === 'Salaries' || !form.person.startsWith('worker:') ? form.person : '',
                  supplier_id: '',
                  splitPayment: false,
                  cashAmount: '',
                  onlineAmount: '',
                  amount: '',
                  bank_account_id: '',
                })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {form.category === 'Raw Material Purchase' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vendor (optional)</label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                  >
                    <option value="">— Select —</option>
                    {suppliersList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.splitPayment}
                    onChange={(e) => setForm({ ...form, splitPayment: e.target.checked, amount: '', cashAmount: '', onlineAmount: '' })}
                    className="rounded border-gray-300 text-navy focus:ring-navy"
                  />
                  Split between cash and online (e.g. 50/50)
                </label>
              </>
            )}
            {isSplit ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cash Amount (PKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cashAmount}
                      onChange={(e) => setForm({ ...form, cashAmount: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Online Amount (PKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.onlineAmount}
                      onChange={(e) => setForm({ ...form, onlineAmount: e.target.value })}
                      placeholder="0"
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                    />
                  </div>
                </div>
                {splitOnline > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account (for online portion) *</label>
                    <select
                      value={form.bank_account_id}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                    >
                      <option value="">— Select —</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2.5 py-2">
                  Total: <span className="font-semibold text-navy">PKR {splitTotal.toLocaleString()}</span> — will be recorded as a single expense entry.
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Paid From</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value, bank_account_id: '' })}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                {form.method === 'bank' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account *</label>
                    <select
                      value={form.bank_account_id}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                    >
                      <option value="">— Select —</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Amount (PKR) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Fuel for delivery van"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bill / Receipt Photo (optional)</label>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={pickReceipt}
                className="hidden"
              />
              {receiptPreview ? (
                <div className="relative inline-block">
                  <img src={receiptPreview} alt="Receipt preview" className="h-28 rounded-lg border border-gray-200 object-cover" />
                  <button
                    type="button"
                    onClick={clearReceipt}
                    title="Remove photo"
                    className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-1 text-gray-500 hover:text-red-600 shadow"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => receiptInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-lg py-2.5 text-sm text-gray-500 hover:border-navy hover:text-navy transition-colors"
                >
                  <Camera size={15} /> Add Photo
                </button>
              )}
            </div>
            <Button type="submit" variant="accent" disabled={saving} className="w-full flex items-center justify-center gap-2">
              <Wallet size={15} /> {saving ? (receiptFile ? 'Uploading & saving...' : 'Saving...') : 'Save Expense'}
            </Button>
          </form>
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {loading ? (
            <SkeletonTable rows={6} cols={5} />
          ) : expenses.length === 0 ? (
            <EmptyState icon={Receipt} title="No expenses for this month" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Category</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Description</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Person</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Paid From</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, i) => (
                    <tr key={e.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(e.expense_date).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-navy-chip text-navy">{e.category}</span>
                      </td>
                      <td className="px-6 py-3.5 text-gray-700">
                        {e.description}
                        {e.suppliers?.name && <span className="block text-[11px] text-gray-400">Vendor: {e.suppliers.name}</span>}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600 text-xs">
                        {getEmployeeLabel(e)}
                      </td>
                      <td className="px-6 py-3.5 text-gray-600 text-xs">
                        {getPaidFromLabel(e)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-red-600">PKR {Number(e.amount).toLocaleString()}</td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {e.receipt_url && (
                          <button
                            onClick={() => setViewReceipt(e)}
                            className="inline-flex items-center gap-1.5 text-xs text-navy hover:underline font-medium mr-3"
                          >
                            <ImageIcon size={13} /> View Photo
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(e)}
                          disabled={deletingId === e.id}
                          className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:underline font-medium disabled:opacity-50"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-navy">
                    <td colSpan={5} className="px-6 py-3.5 text-white font-semibold text-sm">TOTAL</td>
                    <td className="px-6 py-3.5 text-orange font-bold text-sm text-right">PKR {totalExpenses.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {viewReceipt && (
        <Modal
          title={`${viewReceipt.category} — PKR ${Number(viewReceipt.amount).toLocaleString()}`}
          onClose={() => setViewReceipt(null)}
          size="lg"
        >
          <p className="text-sm text-gray-600 mb-3">
            {viewReceipt.description} · {new Date(viewReceipt.expense_date).toLocaleDateString('en-GB')}
          </p>
          <img src={viewReceipt.receipt_url} alt="Bill / receipt" className="w-full rounded-xl border border-gray-200" />
          <div className="flex justify-end pt-4">
            <a
              href={viewReceipt.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-navy hover:underline"
            >
              Open in new tab
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
