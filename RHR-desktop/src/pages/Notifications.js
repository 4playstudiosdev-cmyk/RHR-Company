import React, { useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const ROLE_OPTIONS = [
  { value: 'customer', label: 'All Customers' },
  { value: 'salesman', label: 'All Salesmen' },
  { value: 'delivery', label: 'All Delivery Staff' },
  { value: 'branch_admin', label: 'All Branch Admins' }
];

const EMPTY_FORM = { title: '', body: '', type: 'broadcast', targetMode: 'role', recipient_role: 'customer', recipient_id: '' };

export default function Notifications() {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);

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

  return (
    <div className="p-6">
      <PageHeader title="Notifications" subtitle="Send push notifications and view notification history" />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
        <h2 className="font-semibold text-navy mb-4">Send Notification</h2>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message *</label>
            <textarea
              required
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Send To</label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.targetMode === 'role'}
                  onChange={() => setForm({ ...form, targetMode: 'role' })}
                />
                A group (by role)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.targetMode === 'specific'}
                  onChange={() => setForm({ ...form, targetMode: 'specific' })}
                />
                A specific person
              </label>
            </div>

            {form.targetMode === 'role' ? (
              <select
                value={form.recipient_role}
                onChange={(e) => setForm({ ...form, recipient_role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            ) : (
              <select
                value={form.recipient_id}
                onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="">— Select recipient —</option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={sending} className="flex items-center gap-2">
              <Send size={15} /> {sending ? 'Sending...' : 'Send Notification'}
            </Button>
          </div>
        </form>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <h2 className="font-semibold text-navy mb-3">History</h2>
      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications sent yet" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Title</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Message</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Target</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Sent</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n, i) => (
                  <tr
                    key={n.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${
                      i % 2 === 1 ? 'bg-gray-50/40' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-medium text-navy">{n.title}</td>
                    <td className="px-6 py-3.5 text-gray-600">{n.body}</td>
                    <td className="px-6 py-3.5 text-gray-500 text-xs">
                      {n.recipient_role ? `Role: ${n.recipient_role}` : 'Specific user'}
                    </td>
                    <td className="px-6 py-3.5 text-gray-500">
                      {new Date(n.created_at).toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
