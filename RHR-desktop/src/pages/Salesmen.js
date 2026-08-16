import React, { useEffect, useState } from 'react';
import { Plus, UserCog, UserCheck, Pencil, UserX, UserCheck2 } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_FORM = { full_name: '', phone: '', email: '', password: '', position: '' };

export default function Salesmen() {
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
    { key: 'all', label: 'All Salesmen', count: salesmen.length }
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Salesmen"
        subtitle="Approve self-registered salesmen and manage accounts"
        action={
          <Button variant="accent" onClick={openAddModal} className="flex items-center gap-2">
            <Plus size={16} /> Add Salesman
          </Button>
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
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : tab === 'pending' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {pending.length === 0 ? (
            <EmptyState icon={UserCheck} title="No salesmen awaiting approval" subtitle="Self-registered salesmen will show up here" />
          ) : (
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
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {salesmen.length === 0 ? (
            <EmptyState icon={UserCog} title="No salesmen found" subtitle="Add a salesman account to get started" />
          ) : (
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
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
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
                            s.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
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
