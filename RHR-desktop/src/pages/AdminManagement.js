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
                  </div>
                </div>
              </div>

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
