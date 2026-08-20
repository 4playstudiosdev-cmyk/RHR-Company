import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, UserCog, UserCheck, Pencil, UserX, UserCheck2,
  ShoppingCart, Wallet, Footprints, TrendingUp, Download, BarChart3
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { exportTableToExcel } from './production/exportUtils';

const EMPTY_FORM = { full_name: '', phone: '', email: '', password: '', position: '' };
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export default function Salesmen({ onViewLedger }) {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [pendingRes, allRes] = await Promise.all([
        api.get('/salesmen/pending'),
        api.get('/salesmen')
      ]);
      setPending(pendingRes.data.data || []);
      setSalesmen(allRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load salesmen.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (salesman) => {
    if (!window.confirm(`Approve "${salesman.full_name}"?`)) return;
    setApprovingId(salesman.id);
    try {
      await api.patch(`/auth/approve-salesman/${salesman.id}`);
      toast.success(`${salesman.full_name} approved.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve salesman.');
    } finally {
      setApprovingId(null);
    }
  };

  const openAddModal = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (s) => {
    setEditing(s);
    setForm({ full_name: s.full_name || '', phone: s.phone || '', email: s.email || '', password: '', position: s.position || '' });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name || (!editing && (!form.email || !form.password))) {
      toast.error('Full name, email and password are required.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/salesmen/${editing.id}`, {
          full_name: form.full_name,
          phone: form.phone,
          position: form.position
        });
        toast.success('Salesman updated.');
      } else {
        await api.post('/salesmen', {
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          password: form.password,
          position: form.position
        });
        toast.success('Salesman account created.');
      }
      setShowModal(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save salesman.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s) => {
    const action = s.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} "${s.full_name}"?`)) return;
    setBusyId(s.id);
    try {
      if (s.is_active) {
        await api.delete(`/salesmen/${s.id}`);
      } else {
        await api.patch(`/salesmen/${s.id}`, { is_active: true });
      }
      toast.success(`Salesman ${action}d.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} salesman.`);
    } finally {
      setBusyId(null);
    }
  };

  const tabs = [
    { key: 'pending', label: 'Pending Approval', count: pending.length },
    { key: 'all', label: 'All Salesmen', count: salesmen.length },
    { key: 'performance', label: 'Performance' }
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Salesmen"
        subtitle="Approve self-registered salesmen, manage accounts, and review performance"
        action={
          tab !== 'performance' && (
            <Button variant="accent" onClick={openAddModal} className="flex items-center gap-2">
              <Plus size={16} /> Add Salesman
            </Button>
          )
        }
      />

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {tab === 'performance' ? (
        <PerformanceTab salesmen={salesmen} onViewLedger={onViewLedger} toast={toast} />
      ) : loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : tab === 'pending' ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {pending.length === 0 ? (
            <EmptyState icon={UserCheck} title="No salesmen awaiting approval" subtitle="Self-registered salesmen will show up here" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Registered</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{s.full_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{s.phone}</td>
                      <td className="px-6 py-3.5 text-gray-500">
                        {new Date(s.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-3.5">
                        <Button
                          variant="accent"
                          className="text-xs px-3 py-1.5"
                          onClick={() => handleApprove(s)}
                          disabled={approvingId === s.id}
                        >
                          {approvingId === s.id ? 'Approving...' : 'Approve'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {salesmen.length === 0 ? (
            <EmptyState icon={UserCog} title="No salesmen found" subtitle="Add a salesman account to get started" />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Position</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Email</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {salesmen.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-medium text-navy">{s.full_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{s.position || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{s.phone || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{s.email || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          !s.is_active
                            ? 'bg-gray-100 text-gray-500'
                            : s.is_approved
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {!s.is_active ? 'Inactive' : s.is_approved ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(s)}
                          className="p-2 rounded-lg text-navy hover:bg-navy/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(s)}
                          disabled={busyId === s.id}
                          className={`p-2 rounded-lg transition-colors ${
                            s.is_active ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={s.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          {s.is_active ? <UserX size={15} /> : <UserCheck2 size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Salesman' : 'Add Salesman'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Position</label>
              <input
                type="text"
                placeholder="e.g. Sales Executive, Area Manager"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            {!editing && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  This creates an account directly (auto-approved). Most salesmen should instead self-register from the phone app and be approved from the "Pending Approval" tab.
                </p>
              </>
            )}
            {editing && (
              <p className="text-xs text-gray-400">Email and password can't be changed here — only name, phone and position.</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Performance ──
// Backed by GET /api/v1/analytics/salesman/:id — an endpoint that already
// existed but wasn't used by any page yet.

function weekBucket(dateStr) {
  const d = new Date(dateStr).getDate();
  return Math.min(4, Math.ceil(d / 7)) - 1; // 0..4 -> W1..W5, capped to a 4-bar view (W5 folds into W4)
}

function PerformanceTab({ salesmen, onViewLedger, toast }) {
  const [userId, setUserId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.get(`/analytics/salesman/${userId}`, { params: { month, year } });
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load performance data.');
    } finally {
      setLoading(false);
    }
  }, [userId, month, year, toast]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load ledger balances for the customers in the visit log.
  useEffect(() => {
    if (!data?.visits) return;
    const customerIds = [...new Set(data.visits.map((v) => v.customer_id).filter(Boolean))];
    const toFetch = customerIds.filter((id) => !(id in balances));
    if (toFetch.length === 0) return;
    Promise.all(
      toFetch.map((id) =>
        api.get(`/ledger/${id}`).then((res) => ({ id, balance: res.data.data.currentBalance || 0 })).catch(() => ({ id, balance: null }))
      )
    ).then((results) => {
      setBalances((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.balance; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const visitsByCustomer = useMemo(() => {
    if (!data?.visits) return [];
    const map = new Map();
    data.visits.forEach((v) => {
      const key = v.customer_id;
      if (!map.has(key)) {
        map.set(key, { customerId: key, name: v.users?.full_name || 'Unknown', lastVisit: v.visited_at, totalVisits: 0, notes: v.notes });
      }
      const entry = map.get(key);
      entry.totalVisits += 1;
      if (new Date(v.visited_at) > new Date(entry.lastVisit)) {
        entry.lastVisit = v.visited_at;
        entry.notes = v.notes || entry.notes;
      }
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.lastVisit) - new Date(a.lastVisit));
  }, [data]);

  const weeklyOrders = useMemo(() => {
    const buckets = [0, 0, 0, 0];
    (data?.orders || []).forEach((o) => { if (o.created_at) buckets[weekBucket(o.created_at)] += 1; });
    return buckets;
  }, [data]);

  const weeklyCollections = useMemo(() => {
    const buckets = [0, 0, 0, 0];
    (data?.payments || []).forEach((p) => { if (p.created_at) buckets[weekBucket(p.created_at)] += Number(p.amount); });
    return buckets;
  }, [data]);

  const maxOrders = Math.max(...weeklyOrders, 1);
  const maxCollections = Math.max(...weeklyCollections, 1);
  const avgOrderValue = data && data.totalOrders > 0 ? data.totalSales / data.totalOrders : 0;

  const handleExportVisits = () => {
    if (visitsByCustomer.length === 0) { toast.error('No visits to export.'); return; }
    const selected = salesmen.find((s) => s.id === userId);
    exportTableToExcel({
      sheetName: 'Visits',
      head: ['Customer', 'Last Visit', 'Total Visits', 'Outstanding (PKR)', 'Notes'],
      rows: visitsByCustomer.map((v) => [
        v.name,
        new Date(v.lastVisit).toLocaleDateString('en-GB'),
        v.totalVisits,
        balances[v.customerId] ?? '',
        v.notes || ''
      ]),
      filename: `${(selected?.full_name || 'salesman').replace(/\s+/g, '-')}-visits-${month}-${year}`
    });
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[220px]">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Salesman</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
            >
              <option value="">— Select a salesman —</option>
              {salesmen.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
            >
              {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
        </div>
        {userId && (
          <button
            onClick={handleExportVisits}
            className="flex items-center gap-1.5 border border-gray-200 text-navy hover:bg-gray-50 text-sm font-medium px-3.5 py-2.5 rounded-lg transition-colors"
          >
            <Download size={15} /> Export Visits
          </button>
        )}
      </div>

      {!userId ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100">
          <EmptyState icon={BarChart3} title="Select a salesman" subtitle="Choose a salesman above to review their performance" />
        </div>
      ) : loading || !data ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-navy-chip text-navy flex items-center justify-center flex-shrink-0">
                <ShoppingCart size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Orders</p>
                <p className="text-2xl font-bold text-navy leading-tight">{data.totalOrders}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Wallet size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Collections</p>
                <p className="text-2xl font-bold text-navy leading-tight">PKR {Number(data.totalCollected).toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange/10 text-orange flex items-center justify-center flex-shrink-0">
                <Footprints size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Customer Visits</p>
                <p className="text-2xl font-bold text-navy leading-tight">{data.totalVisits}</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-navy-chip text-navy flex items-center justify-center flex-shrink-0">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Avg Order Value</p>
                <p className="text-2xl font-bold text-navy leading-tight">PKR {Math.round(avgOrderValue).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy mb-4 text-sm">Orders by Week — {MONTH_NAMES[month - 1]}</h3>
              <div className="flex items-end justify-around gap-3 h-40">
                {weeklyOrders.map((v, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full justify-end">
                    <div className="w-full max-w-[36px] bg-navy rounded-t-md transition-all" style={{ height: `${Math.max((v / maxOrders) * 100, v > 0 ? 6 : 2)}%` }} />
                    <span className="text-xs text-gray-400">W{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
              <h3 className="font-semibold text-navy mb-4 text-sm">Collections by Week — {MONTH_NAMES[month - 1]}</h3>
              <div className="flex items-end justify-around gap-3 h-40">
                {weeklyCollections.map((v, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 h-full justify-end">
                    <div className="w-full max-w-[36px] bg-orange rounded-t-md transition-all" style={{ height: `${Math.max((v / maxCollections) * 100, v > 0 ? 6 : 2)}%` }} />
                    <span className="text-xs text-gray-400">W{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-navy text-sm">Customer Visit Log</h3>
              <span className="text-xs text-gray-400">Detailed breakdown of field activity this period</span>
            </div>
            {visitsByCustomer.length === 0 ? (
              <EmptyState icon={Footprints} title="No visits logged this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Customer</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Last Visit</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Total Visits</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Outstanding</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Notes</th>
                      {onViewLedger && <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visitsByCustomer.map((v, i) => {
                      const balance = balances[v.customerId];
                      return (
                        <tr key={v.customerId} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-navy-chip text-navy flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                                {getInitials(v.name)}
                              </div>
                              <span className="font-medium text-navy">{v.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-gray-500">{new Date(v.lastVisit).toLocaleDateString('en-GB')}</td>
                          <td className="px-6 py-3.5 text-gray-600">{v.totalVisits}</td>
                          <td className="px-6 py-3.5 text-right font-medium">
                            {balance === undefined ? (
                              <span className="text-gray-300 text-xs">loading…</span>
                            ) : balance > 0 ? (
                              <span className="text-red-600">PKR {Number(balance).toLocaleString()}</span>
                            ) : (
                              <span className="text-gray-400">PKR 0</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-gray-500 truncate max-w-[220px]">{v.notes || '—'}</td>
                          {onViewLedger && (
                            <td className="px-6 py-3.5 text-right">
                              <button onClick={() => onViewLedger(v.customerId)} className="text-xs text-navy hover:underline font-medium">
                                View Ledger
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
