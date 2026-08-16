import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Send, History, Search, Users2, Radio, Package } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const ROLE_OPTIONS = [
  { value: 'customer', label: 'All Customers' },
  { value: 'salesman', label: 'All Salesmen' },
  { value: 'delivery', label: 'All Delivery Staff' },
  { value: 'branch_admin', label: 'All Branch Admins' }
];

const ROLE_BADGE = {
  customer: { label: 'All Customers', icon: Users2, classes: 'bg-navy-chip text-navy' },
  salesman: { label: 'All Salesmen', icon: Package, classes: 'bg-orange/10 text-orange' },
  delivery: { label: 'All Delivery Staff', icon: Package, classes: 'bg-orange/10 text-orange' },
  branch_admin: { label: 'All Branch Admins', icon: Radio, classes: 'bg-navy-chip text-navy' }
};

const EMPTY_FORM = { title: '', body: '', type: 'broadcast', targetMode: 'role', recipient_role: 'customer', recipient_id: '' };
const PAGE_SIZE = 8;

export default function Notifications() {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    loadNotifications();
    loadRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  // Combine customers + salesmen into one "specific person" picker —
  // there's no single "list all users" endpoint, so we reuse what's already exposed.
  const loadRecipients = async () => {
    try {
      const [customersRes, staffRes] = await Promise.all([
        api.get('/customers'),
        api.get('/salesmen')
      ]);
      const customerList = (customersRes.data.data || []).map((c) => ({
        id: c.id,
        label: `${c.full_name} (Customer)`
      }));
      const staffList = (staffRes.data.data || []).map((s) => ({
        id: s.id,
        label: `${s.full_name} (Salesman)`
      }));
      setRecipients([...staffList, ...customerList]);
    } catch (err) {
      // non-fatal — role-based broadcast still works without this list
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title || !form.body) {
      toast.error('Title and body are required.');
      return;
    }
    if (form.targetMode === 'specific' && !form.recipient_id) {
      toast.error('Please select a recipient.');
      return;
    }
    setSending(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        type: form.type,
        ...(form.targetMode === 'specific'
          ? { recipient_id: form.recipient_id }
          : { recipient_role: form.recipient_role })
      };
      const res = await api.post('/notifications/send', payload);
      toast.success(res.data.message || 'Notification sent.');
      setForm(EMPTY_FORM);
      loadNotifications();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send notification.');
    } finally {
      setSending(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return notifications;
    const q = search.trim().toLowerCase();
    return notifications.filter(
      (n) => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q)
    );
  }, [notifications, search]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Manage and broadcast messages to stakeholders.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Send Broadcast */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl shadow-card border-l-4 border-navy p-6">
            <h3 className="font-semibold text-navy mb-4 flex items-center gap-2">
              <span className="bg-navy-chip text-navy p-2 rounded-lg flex items-center justify-center">
                <Send size={16} />
              </span>
              Send Broadcast
            </h3>
            <form onSubmit={handleSend} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Send To</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="radio"
                      checked={form.targetMode === 'role'}
                      onChange={() => setForm({ ...form, targetMode: 'role' })}
                    />
                    A group
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="radio"
                      checked={form.targetMode === 'specific'}
                      onChange={() => setForm({ ...form, targetMode: 'specific' })}
                    />
                    Specific person
                  </label>
                </div>
                {form.targetMode === 'role' ? (
                  <select
                    value={form.recipient_role}
                    onChange={(e) => setForm({ ...form, recipient_role: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow bg-white"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={form.recipient_id}
                    onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow bg-white"
                  >
                    <option value="">— Select recipient —</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Enter message title"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Message</label>
                <textarea
                  required
                  rows={4}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="Type your broadcast message..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow resize-none"
                />
              </div>
              <Button type="submit" variant="accent" disabled={sending} className="flex items-center justify-center gap-2 mt-1">
                <Send size={15} /> {sending ? 'Sending...' : 'Send Broadcast'}
              </Button>
            </form>
          </div>
        </div>

        {/* Sent History */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3 bg-gray-50/50">
              <h3 className="font-semibold text-navy flex items-center gap-2">
                <History size={17} className="text-gray-400" /> Sent History
              </h3>
              <div className="relative w-full sm:w-56">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
                  placeholder="Search history..."
                  className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="m-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <SkeletonTable rows={5} cols={4} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications sent yet" subtitle={search ? 'Try a different search' : undefined} />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Sent To</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Title</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Message Preview</th>
                        <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((n, i) => {
                        const roleMeta = n.recipient_role ? ROLE_BADGE[n.recipient_role] : null;
                        const RoleIcon = roleMeta?.icon || Users2;
                        return (
                          <tr
                            key={n.id}
                            className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                              i % 2 === 1 ? 'bg-gray-50/40' : ''
                            }`}
                          >
                            <td className="px-6 py-3.5 whitespace-nowrap text-gray-500">
                              {new Date(n.created_at).toLocaleDateString('en-GB')}
                            </td>
                            <td className="px-6 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${roleMeta?.classes || 'bg-gray-100 text-gray-600'}`}>
                                <RoleIcon size={13} /> {roleMeta?.label || 'Specific user'}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 font-medium text-navy">{n.title}</td>
                            <td className="px-6 py-3.5 text-gray-500 truncate max-w-[220px]">{n.body}</td>
                            <td className="px-6 py-3.5 text-right">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                                Sent
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {visibleCount < filtered.length && (
                  <div className="p-3 border-t border-gray-100 flex justify-center bg-gray-50/50">
                    <button
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      className="text-navy text-sm font-medium hover:underline"
                    >
                      View Older History
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
