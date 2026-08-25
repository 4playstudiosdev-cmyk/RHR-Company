import React, { useEffect, useState } from 'react';
import { Plus, Truck, UserCheck, Pencil, UserX, UserCheck2 } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const EMPTY_FORM = { full_name: '', phone: '', car_number: '' };

export default function Drivers() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [drivers, setDrivers] = useState([]);
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
        api.get('/drivers/pending'),
        api.get('/drivers')
      ]);
      setPending(pendingRes.data.data || []);
      setDrivers(allRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load drivers.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (driver) => {
    if (!window.confirm(`Approve "${driver.full_name}"?`)) return;
    setApprovingId(driver.id);
    try {
      await api.patch(`/auth/approve-driver/${driver.id}`);
      toast.success(`${driver.full_name} approved.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve driver.');
    } finally {
      setApprovingId(null);
    }
  };

  const openAddModal = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (d) => {
    setEditing(d);
    setForm({ full_name: d.full_name || '', phone: d.phone || '', car_number: d.car_number || '' });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name || (!editing && !form.phone)) {
      toast.error('Full name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/drivers/${editing.id}`, {
          full_name: form.full_name,
          phone: form.phone,
          car_number: form.car_number
        });
        toast.success('Driver updated.');
      } else {
        await api.post('/drivers', {
          full_name: form.full_name,
          phone: form.phone,
          car_number: form.car_number
        });
        toast.success('Driver account created.');
      }
      setShowModal(false);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save driver.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (d) => {
    const action = d.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} "${d.full_name}"?`)) return;
    setBusyId(d.id);
    try {
      if (d.is_active) {
        await api.delete(`/drivers/${d.id}`);
      } else {
        await api.patch(`/drivers/${d.id}`, { is_active: true });
      }
      toast.success(`Driver ${action}d.`);
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} driver.`);
    } finally {
      setBusyId(null);
    }
  };

  const tabs = [
    { key: 'pending', label: 'Pending Approval', count: pending.length },
    { key: 'all', label: 'All Drivers', count: drivers.length }
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="Drivers"
        subtitle="Approve self-registered drivers, manage accounts, and track vehicles"
        action={
          <Button variant="accent" onClick={openAddModal} className="flex items-center gap-2">
            <Plus size={16} /> Add Driver
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
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : tab === 'pending' ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          {pending.length === 0 ? (
            <EmptyState icon={UserCheck} title="No drivers awaiting approval" subtitle="Self-registered drivers will show up here" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Car Number</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Registered</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((d, i) => (
                    <tr
                      key={d.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                        i % 2 === 1 ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-medium text-navy">{d.full_name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{d.phone}</td>
                      <td className="px-6 py-3.5 text-gray-600">{d.car_number || '—'}</td>
                      <td className="px-6 py-3.5 text-gray-500">
                        {new Date(d.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-6 py-3.5">
                        <Button
                          variant="accent"
                          className="text-xs px-3 py-1.5"
                          onClick={() => handleApprove(d)}
                          disabled={approvingId === d.id}
                        >
                          {approvingId === d.id ? 'Approving...' : 'Approve'}
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
          {drivers.length === 0 ? (
            <EmptyState icon={Truck} title="No drivers found" subtitle="Add a driver account to get started" />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Car Number</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d, i) => (
                  <tr
                    key={d.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-medium text-navy">{d.full_name}</td>
                    <td className="px-6 py-3.5 text-gray-600">{d.car_number || '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{d.phone || '—'}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          !d.is_active
                            ? 'bg-gray-100 text-gray-500'
                            : d.is_approved
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {!d.is_active ? 'Inactive' : d.is_approved ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(d)}
                          className="p-2 rounded-lg text-navy hover:bg-navy/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(d)}
                          disabled={busyId === d.id}
                          className={`p-2 rounded-lg transition-colors ${
                            d.is_active ? 'text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={d.is_active ? 'Deactivate' : 'Reactivate'}
                        >
                          {d.is_active ? <UserX size={15} /> : <UserCheck2 size={15} />}
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
        <Modal title={editing ? 'Edit Driver' : 'Add Driver'} onClose={() => setShowModal(false)}>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone {!editing && '*'}</label>
              <input
                type="text"
                required={!editing}
                disabled={!!editing}
                placeholder="03001234567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Car Number</label>
              <input
                type="text"
                placeholder="e.g. KHI-1234"
                value={form.car_number}
                onChange={(e) => setForm({ ...form, car_number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            {!editing && (
              <p className="text-xs text-gray-400">
                This creates an account directly (auto-approved), logged in via phone + WhatsApp OTP. Most drivers should instead self-register from the phone app and be approved from the "Pending Approval" tab.
              </p>
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
