import React, { useEffect, useState } from 'react';
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
    <div className="flex h-screen bg-cream">
      <Sidebar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        <PageComponent
          user={user}
          setPage={setPage}
          onViewLedger={goToLedger}
          initialCustomerId={ledgerCustomerId}
        />
      </main>
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
