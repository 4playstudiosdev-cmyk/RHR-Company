import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import AdminLocationService from './services/adminLocationService';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Salesmen from './pages/Salesmen';
import Payments from './pages/Payments';
import Ledger from './pages/Ledger';
import Reports from './pages/Reports';
import GPS from './pages/GPS';
import Notifications from './pages/Notifications';
import HRM from './pages/HRM';
import ProductionDashboard from './pages/production/ProductionDashboard';
import RawMaterials from './pages/production/RawMaterials';
import ProductionOrders from './pages/production/ProductionOrders';
import Dispatch from './pages/production/Dispatch';
import ProductionReports from './pages/production/ProductionReports';

const PAGES = {
  dashboard: Dashboard,
  products: Products,
  orders: Orders,
  customers: Customers,
  salesmen: Salesmen,
  payments: Payments,
  ledger: Ledger,
  reports: Reports,
  gps: GPS,
  notifications: Notifications,
  'production-dashboard': ProductionDashboard,
  'production-materials': RawMaterials,
  'production-orders': ProductionOrders,
  'production-dispatch': Dispatch,
  'production-reports': ProductionReports,
  hrm: HRM
};

function AppShell() {
  const [token, setToken] = useState(localStorage.getItem('rhr_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('rhr_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [page, setPage] = useState('dashboard');
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
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('rhr_token');
    localStorage.removeItem('rhr_user');
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
          <PageComponent
            user={user}
            setPage={setPage}
            onViewLedger={goToLedger}
            initialCustomerId={ledgerCustomerId}
          />
        </main>
      </div>
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
