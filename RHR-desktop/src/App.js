import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import SessionWarning from './components/SessionWarning';
import LocationGate from './components/LocationGate';
import AdminLocationService from './services/adminLocationService';
import api, { hasPermission } from './services/api';
import { ToastProvider } from './components/Toast';
import NotificationBell from './components/NotificationBell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DailyDashboard from './pages/DailyDashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Salesmen from './pages/Salesmen';
import SalesmanRecovery from './pages/SalesmanRecovery';
import VehicleManagement from './pages/VehicleManagement';
import Suppliers from './pages/Suppliers';
import Returns from './pages/Returns';
import Payments from './pages/Payments';
import Bank from './pages/Bank';
import Expenses from './pages/Expenses';
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
import ProductionReports from './pages/production/ProductionReports';
import RecipesPage from './pages/production/RecipesPage';
import DailyProduction from './pages/production/DailyProduction';
import StockTransfers from './pages/StockTransfers';
import StockReports from './pages/StockReports';
import OpeningBalances from './pages/OpeningBalances';
import DeletedItems from './pages/DeletedItems';
import ManufacturingEmployees from './pages/ManufacturingEmployees';

const PAGES = {
  dashboard: Dashboard,
  'daily-dashboard': DailyDashboard,
  products: Products,
  orders: Orders,
  customers: Customers,
  salesmen: Salesmen,
  recovery: SalesmanRecovery,
  vehicles: VehicleManagement,
  suppliers: Suppliers,
  returns: Returns,
  payments: Payments,
  bank: Bank,
  expenses: Expenses,
  ledger: Ledger,
  reports: Reports,
  gps: GPS,
  notifications: Notifications,
  'production-dashboard': ProductionDashboard,
  'production-materials': RawMaterials,
  'production-orders': ProductionOrders,
  'production-log': ProductionLog,
  'production-reports': ProductionReports,
  'production-recipes': RecipesPage,
  'production-daily': DailyProduction,
  'stock-transfers': StockTransfers,
  'stock-reports': StockReports,
  hrm: HRM,
  admins: AdminManagement,
  'opening-balances': OpeningBalances,
  'deleted-items': DeletedItems,
  'manufacturing-employees': ManufacturingEmployees
};

// Dashboard and Admin Roles are the only super_admin-exclusive pages now —
// branch admins get everything else (their own branch's Products, Raw
// Materials, Production, HRM, etc.) per the Karachi/Hyderabad/Sukkur
// access model.
const PAGE_ACCESS = {
  dashboard: { requiredRole: 'super_admin' },
  payments: { requiredPermission: 'can_view_payments' },
  recovery: { requiredPermission: 'can_view_payments' },
  vehicles: { requiredPermission: 'can_view_payments' },
  bank: { requiredPermission: 'can_view_payments' },
  expenses: { requiredPermission: 'can_view_payments' },
  reports: { requiredPermission: 'can_export_reports' },
  'stock-reports': { requiredPermission: 'can_export_reports' },
  gps: { requiredPermission: 'can_view_gps' },
  admins: { requiredRole: 'super_admin' },
  customers: { requiredPermission: 'can_manage_customers' },
  hrm: { requiredPermission: 'can_manage_hrm' },
  'production-materials': { requiredPermission: 'can_manage_production' },
  suppliers: { requiredPermission: 'can_manage_production' },
  returns: { requiredPermission: 'can_manage_production' },
  'production-dashboard': { requiredPermission: 'can_manage_production' },
  'production-orders': { requiredPermission: 'can_manage_production' },
  'production-log': { requiredPermission: 'can_manage_production' },
  'production-reports': { requiredPermission: 'can_manage_production' },
  'production-recipes': { requiredPermission: 'can_manage_production' },
  'production-daily': { requiredPermission: 'can_manage_production' },
  'manufacturing-employees': { requiredPermission: 'can_manage_production' },
  'opening-balances': { requiredRole: 'super_admin' }
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
  // Lets Ledger.js's clickable order-number links jump straight to that
  // order's detail view on the Orders page.
  const [targetOrderNumber, setTargetOrderNumber] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop-only icon-rail mode — persisted so it survives a refresh.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

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

  const handleLogout = async () => {
    // Releases the single-session lock so this account can be logged
    // into elsewhere right away. Must be AWAITED before clearing
    // localStorage below — api.js's request interceptor reads the token
    // out of localStorage at send time, not at call time, so clearing it
    // first (as this used to do, firing the request without awaiting)
    // meant /auth/logout went out with no Authorization header, always
    // 401'd, and the lock never actually cleared — which is why logging
    // back in kept saying "already logged in on another device" even
    // right after a real logout. Best-effort past this point: the
    // client-side logout below always proceeds either way.
    try {
      await api.post('/auth/logout');
    } catch (e) { /* still log out locally either way */ }
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

  const goToOrder = (orderNumber) => {
    setTargetOrderNumber(orderNumber);
    setPage('orders');
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
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />
      {/* md:pl-10 when collapsed clears the floating toggle arrow, which
          otherwise sits right where a page's title/heading starts once
          the sidebar itself is 0-width. */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:pl-10' : ''}`}>
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
          <ErrorBoundary resetKey={page}>
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
                onViewOrderNumber={goToOrder}
                initialOrderNumber={targetOrderNumber}
              />
            </ProtectedRoute>
          </ErrorBoundary>
        </main>
      </div>
      <SessionWarning />
      <LocationGate user={user} />
      {hasPermission('notifications', user) && <NotificationBell setPage={setPage} />}
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
