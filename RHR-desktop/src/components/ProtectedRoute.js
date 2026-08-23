import { hasPermission } from '../services/api';

// This app has no router (see App.js — page switching is local state, not
// react-router-dom), so this isn't a <Route> guard — AppShell already
// handles "not logged in" (renders <Login/> directly) and session expiry
// before a page ever gets this far. This component's only job is the
// role/permission check for the currently-selected page, rendered in
// place of the real page when access is denied.
export default function ProtectedRoute({ children, user, requiredRole = null, requiredPermission = null }) {
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow border border-red-100">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">
            This page requires <strong>{requiredRole}</strong> access.
          </p>
          <p className="text-gray-400 text-xs mt-1">Your role: {user?.role}</p>
        </div>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission, user)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow border border-orange-100">
          <div className="text-5xl mb-4">⛔</div>
          <h2 className="text-xl font-bold text-orange-600 mb-2">Feature Disabled</h2>
          <p className="text-gray-500 text-sm">This feature has been disabled for your account.</p>
          <p className="text-gray-400 text-xs mt-1">Contact super admin to enable access.</p>
        </div>
      </div>
    );
  }

  return children;
}
