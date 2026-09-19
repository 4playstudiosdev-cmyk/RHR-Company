import React, { useEffect, useState } from 'react';
import { Landmark, Plus, ArrowLeftRight } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';
import { fetchAllCities } from '../utils/multiCityFetch';

const EMPTY_ACCOUNT_FORM = { account_name: '', account_number: '', bank_name: '', branch_name: '' };
const KARACHI_COMPANY_ID = '1e5962c6-33a7-460b-913e-9e08db46973a';

export default function Bank() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? KARACHI_COMPANY_ID : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_ACCOUNT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const companyFilter = selectedCity === 'all' ? null : selectedCity;
      const params = { company_id: companyFilter };
      const [accountsData, transactionsData] = companyFilter
        ? await Promise.all([
            api.get('/bank/accounts', { params }).then((r) => r.data.data || []),
            api.get('/bank/transactions', { params }).then((r) => r.data.data || [])
          ])
        : await Promise.all([
            fetchAllCities('/bank/accounts'),
            fetchAllCities('/bank/transactions')
          ]);
      setAccounts(accountsData);
      setTransactions(transactionsData);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bank data.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!form.account_name || !form.account_number || !form.bank_name) {
      toast.error('Account name, account number and bank name are required.');
      return;
    }
    setSaving(true);
    try {
      const targetCompanyId = selectedCity === 'all' ? KARACHI_COMPANY_ID : selectedCity;
      await api.post('/bank/accounts', { ...form, company_id: targetCompanyId });
      toast.success('Bank account added.');
      setShowAddModal(false);
      setForm(EMPTY_ACCOUNT_FORM);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add bank account.');
    } finally {
      setSaving(false);
    }
  };

  const totalTransactions = transactions.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Bank</h1>
          <p className="text-sm text-gray-500 mt-1">Bank accounts and recorded bank-transfer collections.</p>
        </div>
        <div className="flex items-center gap-3">
          <CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />
          {tab === 'accounts' && (
            <Button
              variant="accent"
              onClick={() => { setForm(EMPTY_ACCOUNT_FORM); setShowAddModal(true); }}
              className="flex items-center gap-2"
            >
              <Plus size={16} /> Add Account
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('accounts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'accounts' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Bank Accounts ({accounts.length})
        </button>
        <button
          onClick={() => setTab('transactions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'transactions' ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Transactions ({transactions.length})
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : tab === 'accounts' ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {accounts.length === 0 ? (
            <EmptyState icon={Landmark} title="No bank accounts yet" subtitle="Add one to start recording bank-transfer collections" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account Name</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account Number</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Bank</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a, i) => (
                    <tr key={a.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 font-medium text-navy">{a.account_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{a.account_number}</td>
                      <td className="px-6 py-3.5 text-gray-600">{a.bank_name}</td>
                      <td className="px-6 py-3.5 text-gray-500">{a.branch_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-semibold text-navy text-sm">Bank Transactions</h3>
            <span className="text-sm font-semibold text-navy">Total: PKR {totalTransactions.toLocaleString()}</span>
          </div>
          {transactions.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No bank transactions yet" subtitle="Recoveries recorded with method 'Bank Transfer' will show up here" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Salesman</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Account</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5 text-gray-700">{t.salesman?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-700">{t.customer?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-600">
                        {t.bank_accounts ? `${t.bank_accounts.account_name} — ${t.bank_accounts.bank_name}` : '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right font-semibold text-navy">PKR {Number(t.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <Modal title="Add Bank Account" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAddAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name *</label>
              <input
                type="text"
                required
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Number *</label>
              <input
                type="text"
                required
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bank Name *</label>
              <input
                type="text"
                required
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Branch</label>
              <input
                type="text"
                value={form.branch_name}
                onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
