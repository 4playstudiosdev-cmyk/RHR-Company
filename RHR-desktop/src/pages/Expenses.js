import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Wallet, Plus, Download, Trash2, Receipt } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';
const EXPENSE_CATEGORIES = [
  'Fuel', 'Vehicle Maintenance', 'Office Supplies', 'Utilities', 'Rent',
  'Salaries', 'Transport', 'Raw Material Purchase', 'Equipment', 'Other'
];

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const todayISO = () => new Date().toISOString().split('T')[0];
const EMPTY_FORM = { category: EXPENSE_CATEGORIES[0], amount: '', description: '', expense_date: todayISO() };

export default function Expenses() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity, selectedMonth]);

  const loadExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const [year, month] = selectedMonth.split('-');
      const from = `${year}-${month}-01`;
      const to = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { from, to, company_id: companyFilter };
      const data = companyFilter
        ? (await api.get('/expenses', { params })).data.data || []
        : await fetchAllCities('/expenses', { from, to });
      setExpenses(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0 || !form.description.trim()) {
      toast.error('Amount and description are required.');
      return;
    }
    setSaving(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/expenses', { ...form, amount: Number(form.amount), company_id: targetCompanyId });
      toast.success('Expense recorded.');
      setForm({ ...EMPTY_FORM, expense_date: form.expense_date });
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

  const exportToExcel = () => {
    if (expenses.length === 0) { toast.error('No expenses to export.'); return; }
    const rows = expenses.map((e) => ({
      Date: e.expense_date,
      Category: e.category,
      Description: e.description,
      'Amount (PKR)': Number(e.amount)
    }));
    rows.push({ Date: '', Category: '', Description: 'TOTAL', 'Amount (PKR)': totalExpenses });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `expenses-${selectedMonth}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Company Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Track all company expenses by month.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
          />
          <Button variant="primary" onClick={exportToExcel} className="flex items-center gap-2">
            <Download size={15} /> Export Excel
          </Button>
        </div>
      </div>

      <div className="bg-navy rounded-2xl px-6 py-5 mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-blue-200/70 text-xs font-semibold uppercase tracking-wide">Total Expenses — {selectedMonth}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-fit">
          <h3 className="font-semibold text-navy text-sm mb-4 flex items-center gap-2"><Plus size={15} /> Add Expense</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
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
            <Button type="submit" variant="accent" disabled={saving} className="w-full flex items-center justify-center gap-2">
              <Wallet size={15} /> {saving ? 'Saving...' : 'Save Expense'}
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
                      <td className="px-6 py-3.5 text-gray-700">{e.description}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-red-600">PKR {Number(e.amount).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
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
                    <td colSpan={3} className="px-6 py-3.5 text-white font-semibold text-sm">TOTAL</td>
                    <td className="px-6 py-3.5 text-orange font-bold text-sm text-right">PKR {totalExpenses.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
