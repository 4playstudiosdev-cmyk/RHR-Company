import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';

const PERMISSIONS = [
  { key: 'can_view_payments', label: 'View Payments' },
  { key: 'can_export_reports', label: 'Export Reports' },
  { key: 'can_manage_customers', label: 'Manage Customers' },
  { key: 'can_view_gps', label: 'View GPS Tracker' },
  { key: 'can_manage_hrm', label: 'HRM Access' },
  { key: 'can_manage_production', label: 'Production Access' }
];

export default function AdminManagement() {
  const toast = useToast();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAdmins = useCallback(async () => {
    try {
      const res = await api.get('/admins');
      if (res.data.success) setAdmins(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load admins.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const updatePermission = async (adminId, permission, value) => {
    try {
      await api.patch(`/admins/${adminId}/permissions`, { permission, value });
      loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update permission.');
    }
  };

  const toggleActive = async (adminId, currentStatus) => {
    try {
      await api.patch(`/admins/${adminId}/toggle`, { is_active: !currentStatus });
      loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update admin status.');
    }
  };

  // Clears the single-session lock — needed whenever an admin's browser
  // was closed without clicking Logout, which leaves them locked out of
  // their own account until the lock self-expires (8h). Rather than wait
  // that out (or have me clear it by hand), the super_admin can do this.
  const forceLogout = async (adminId, name) => {
    if (!window.confirm(`Clear ${name}'s active session so they can log in again?`)) return;
    try {
      await api.patch(`/admins/${adminId}/force-logout`);
      toast.success(`${name}'s session cleared.`);
      loadAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to clear session.');
    }
  };

  const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
  const sessionInfo = (admin) => {
    if (!admin.active_session_token || !admin.active_session_started_at) return null;
    const age = Date.now() - new Date(admin.active_session_started_at).getTime();
    if (age > SESSION_MAX_AGE_MS) return null; // expired — treat as not locked
    return { since: new Date(admin.active_session_started_at).toLocaleString() };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-navy border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Admin Management</h1>
        <p className="text-gray-500 text-sm mt-1">Control what each branch admin can access</p>
      </div>

      <div className="grid gap-6">
        {admins.map((admin) => (
          <div key={admin.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                  admin.role === 'super_admin' ? 'bg-orange' : 'bg-navy'
                }`}>
                  {admin.role === 'super_admin' ? '👑' : '🏢'}
                </div>
                <div>
                  <h3 className="font-bold text-navy text-lg">{admin.full_name}</h3>
                  <p className="text-gray-500 text-sm">{admin.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      admin.role === 'super_admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {admin.role === 'super_admin' ? 'Super Admin' : 'Branch Admin'}
                    </span>
                    {sessionInfo(admin) && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                        🟢 Session active since {sessionInfo(admin).since}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {sessionInfo(admin) && (
                  <button
                    onClick={() => forceLogout(admin.id, admin.full_name)}
                    title="Clear their active session so they can log in elsewhere"
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                  >
                    🔓 Force Logout
                  </button>
                )}
                {admin.role !== 'super_admin' && (
                  <button
                    onClick={() => toggleActive(admin.id, admin.is_active)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      admin.is_active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {admin.is_active ? '✅ Active' : '❌ Disabled'}
                  </button>
                )}
              </div>
            </div>

            {admin.role === 'super_admin' ? (
              <div className="bg-orange-50 rounded-lg p-4 text-sm text-orange-700 font-medium">
                👑 Super Admin has full access to all features — permissions cannot be restricted
              </div>
            ) : (
              <div>
                <h4 className="text-sm font-bold text-gray-600 mb-3 uppercase tracking-wide">
                  Feature Permissions
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERMISSIONS.map((perm) => {
                    const perms = admin.permissions || {};
                    const enabled = perms[perm.key] !== false;
                    return (
                      <div
                        key={perm.key}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                          enabled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <span className={`text-sm font-medium ${enabled ? 'text-green-700' : 'text-red-600'}`}>
                          {perm.label}
                        </span>
                        <button
                          onClick={() => updatePermission(admin.id, perm.key, !enabled)}
                          className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${
                            enabled ? 'bg-green-500' : 'bg-red-400'
                          }`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                            enabled ? 'left-6' : 'left-0.5'
                          }`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
