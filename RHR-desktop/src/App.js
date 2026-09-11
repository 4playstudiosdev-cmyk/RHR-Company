import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import SessionWarning from './components/SessionWarning';
import AdminLocationService from './services/adminLocationService';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Salesmen from './pages/Salesmen';
import Drivers from './pages/Drivers';
import Payments from './pages/Payments';
import Ledger from './pages/Ledger';
import Reports from './pages/Reports';
import GPS from './pages/GPS';
import Notifications from './pages/Notifications';
import HRM from './pages/HRM';
import AdminManagement from './pages/AdminManagement';
import ProductionDashboard from './pages/production/ProductionDashboard';
import RawMaterials from './pages/production/RawMaterials';
import ProductionOrders from './pages/production/ProductionOrders';
import ProductionLog from './pages/production/ProductionLog';
import Dispatch from './pages/production/Dispatch';
import ProductionReports from './pages/production/ProductionReports';
import RecipesPage from './pages/production/RecipesPage';
import StockTransfers from './pages/StockTransfers';

const PAGES = {
  dashboard: Dashboard,
  products: Products,
  orders: Orders,
  customers: Customers,
  salesmen: Salesmen,
  drivers: Drivers,
  payments: Payments,
  ledger: Ledger,
  reports: Reports,
  gps: GPS,
  notifications: Notifications,
  'production-dashboard': ProductionDashboard,
  'production-materials': RawMaterials,
  'production-orders': ProductionOrders,
  'production-log': ProductionLog,
  'production-dispatch': Dispatch,
  'production-reports': ProductionReports,
  'production-recipes': RecipesPage,
  'stock-transfers': StockTransfers,
  hrm: HRM,
  admins: AdminManagement
};

// Dashboard and Admin Roles are the only super_admin-exclusive pages now —
// branch admins get everything else (their own branch's Products, Raw
// Materials, Production, HRM, etc.) per the Karachi/Hyderabad/Sukkur
// access model.
const PAGE_ACCESS = {
  dashboard: { requiredRole: 'super_admin' },
  payments: { requiredPermission: 'can_view_payments' },
  reports: { requiredPermission: 'can_export_reports' },
  gps: { requiredPermission: 'can_view_gps' },
  admins: { requiredRole: 'super_admin' },
  customers: { requiredPermission: 'can_manage_customers' },
  hrm: { requiredPermission: 'can_manage_hrm' },
  'production-materials': { requiredPermission: 'can_manage_production' },
  'production-dashboard': { requiredPermission: 'can_manage_production' },
  'production-orders': { requiredPermission: 'can_manage_production' },
  'production-log': { requiredPermission: 'can_manage_production' },
  'production-dispatch': { requiredPermission: 'can_manage_production' },
  'production-reports': { requiredPermission: 'can_manage_production' },
  'production-recipes': { requiredPermission: 'can_manage_production' }
};

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function isSessionExpired() {
  const loginTime = localStorage.getItem('rhr_login_time');
  if (!loginTime) return false; // pre-existing sessions with no timestamp aren't force-logged-out
  return Date.now() - parseInt(loginTime, 10) > SESSION_MAX_AGE_MS;
}

function AppShell() {
  const [token, setToken] = useState(() => {
    if (isSessionExpired()) {
      localStorage.removeItem('rhr_token');
      localStorage.removeItem('rhr_user');
      localStorage.removeItem('rhr_login_time');
      return null;
    }
    return localStorage.getItem('rhr_token');
  });
  const [user, setUser] = useState(() => {
    if (isSessionExpired()) return null;
    const stored = localStorage.getItem('rhr_user');
    return stored ? JSON.parse(stored) : null;
  });
  // Dashboard is super_admin-only now — branch admins land on Products
  // instead, both on a fresh page load (restored session) and right after
  // handleLogin below.
  const [page, setPage] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('rhr_user') || 'null');
      return stored && stored.role !== 'super_admin' ? 'products' : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  // Lets Customers.js jump straight to a specific customer's ledger
  const [ledgerCustomerId, setLedgerCustomerId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Closes the mobile drawer whenever a nav item is picked, without
  // affecting desktop where the sidebar is always static/visible anyway.
  const navigate = (nextPage) => {
    setPage(nextPage);
    setSidebarOpen(false);
  };

  const handleLogin = (newToken, newUser) => {
    localStorage.setItem('rhr_token', newToken);
    localStorage.setItem('rhr_user', JSON.stringify(newUser));
    localStorage.setItem('rhr_login_time', Date.now().toString());
    setToken(newToken);
    setUser(newUser);
    setPage(newUser.role === 'super_admin' ? 'dashboard' : 'products');
  };

  const handleLogout = () => {
    localStorage.removeItem('rhr_token');
    localStorage.removeItem('rhr_user');
    localStorage.removeItem('rhr_login_time');
    setToken(null);
    setUser(null);
    setPage('dashboard');
  };

  const goToLedger = (customerId) => {
    setLedgerCustomerId(customerId);
    setPage('ledger');
  };

  // Continuous admin location tracking, same lifecycle as the salesman
  // app's GPS service — starts whenever a session exists (fresh login or
  // still-logged-in on app relaunch), stops on logout.
  useEffect(() => {
    if (token) {
      AdminLocationService.start();
    } else {
      AdminLocationService.stop();
    }
    return () => AdminLocationService.stop();
  }, [token]);

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const PageComponent = PAGES[page] || Dashboard;
  const access = PAGE_ACCESS[page];

  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      <Sidebar
        page={page}
        setPage={navigate}
        user={user}
        onLogout={handleLogout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-navy text-white flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 -ml-1 text-white"
            aria-label="Open menu"
          >
            <Menu size={24} />
          </button>
          <h1 className="text-base font-bold tracking-wide">RHR & Company</h1>
        </header>
        <main className="flex-1 overflow-y-auto">
          <ProtectedRoute
            user={user}
            requiredRole={access?.requiredRole}
            requiredPermission={access?.requiredPermission}
          >
            <PageComponent
              user={user}
              setPage={setPage}
              onViewLedger={goToLedger}
              initialCustomerId={ledgerCustomerId}
            />
          </ProtectedRoute>
        </main>
      </div>
      <SessionWarning />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
