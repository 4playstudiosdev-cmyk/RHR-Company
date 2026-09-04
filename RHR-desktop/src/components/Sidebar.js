import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, Users, UserCog, Wallet, LogOut,
  BookOpen, FileSpreadsheet, MapPin, Bell, Briefcase, Factory, KeyRound,
  Gauge, Boxes, ClipboardList, Truck, FileBarChart2, ChevronDown, X, CarFront,
  PackageCheck, ArrowLeftRight
} from 'lucide-react';
import api, { hasPermission } from '../services/api';

// requiredRole/requiredPermission here must match PAGE_ACCESS in App.js —
// that's what actually enforces access if someone bypasses the sidebar
// (e.g. an old bookmarked page state); this just keeps the menu itself
// from showing links a user can't use.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'salesmen', label: 'Salesmen', icon: UserCog },
  { key: 'drivers', label: 'Drivers', icon: CarFront },
  { key: 'payments', label: 'Payments', icon: Wallet, requiredPermission: 'can_view_payments' },
  { key: 'ledger', label: 'Ledger', icon: BookOpen },
  { key: 'reports', label: 'Reports', icon: FileSpreadsheet, requiredPermission: 'can_export_reports' },
  { key: 'gps', label: 'Live GPS', icon: MapPin, requiredPermission: 'can_view_gps' },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  {
    key: 'production',
    label: 'Production',
    icon: Factory,
    requiredRole: 'super_admin',
    children: [
      { key: 'production-dashboard', label: 'Production Dashboard', icon: Gauge },
      { key: 'production-materials', label: 'Raw Materials', icon: Boxes },
      { key: 'production-orders', label: 'Production Orders', icon: ClipboardList },
      { key: 'production-log', label: 'Production History', icon: PackageCheck },
      { key: 'production-dispatch', label: 'Dispatch', icon: Truck },
      { key: 'production-reports', label: 'Production Reports', icon: FileBarChart2 },
      { key: 'production-recipes', label: 'Recipes', icon: ClipboardList }
    ]
  },
  { key: 'stock-transfers', label: 'Stock Transfers', icon: ArrowLeftRight },
  { key: 'hrm', label: 'HRM', icon: Briefcase, requiredRole: 'super_admin' },
  { key: 'admins', label: 'Admin Roles', icon: KeyRound, requiredRole: 'super_admin' }
];

function canAccess(item, user) {
  if (item.requiredRole && user?.role !== item.requiredRole) return false;
  if (item.requiredPermission && !hasPermission(item.requiredPermission, user)) return false;
  return true;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

function formatRole(role) {
  if (!role) return '';
  return role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Sidebar({ page, setPage, user, onLogout, open, onClose }) {
  const [productionOpen, setProductionOpen] = useState(page.startsWith('production-'));
  const [pendingTransfers, setPendingTransfers] = useState(0);

  useEffect(() => {
    api.get('/transfers/pending')
      .then((r) => { if (r.data.success) setPendingTransfers((r.data.data || []).length); })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Backdrop — mobile only, closes the drawer on outside tap */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy text-white flex flex-col h-screen flex-shrink-0 overflow-hidden
          transform transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:z-auto`}
      >
      <div className="px-6 py-6 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-white">RHR & Company</h1>
          <p className="text-xs text-blue-200/70 mt-1">Admin Desktop Panel</p>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-blue-200/70 hover:text-white p-1 -mr-1"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-5 space-y-1.5">
        {NAV_ITEMS.filter((item) => canAccess(item, user)).map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const groupActive = page.startsWith(`${item.key}-`);
            return (
              <div key={item.key}>
                <button
                  onClick={() => setProductionOpen((prev) => !prev)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    groupActive
                      ? 'bg-white/10 text-white'
                      : 'text-blue-200/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    size={15}
                    className={`transition-transform ${productionOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {productionOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-1">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      const active = page === child.key;
                      return (
                        <button
                          key={child.key}
                          onClick={() => setPage(child.key)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            active
                              ? 'bg-navy-container text-white shadow-sm'
                              : 'text-blue-200/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <ChildIcon size={15} strokeWidth={2} />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-navy-container text-white shadow-sm'
                  : 'text-blue-200/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === 'stock-transfers' && pendingTransfers > 0 && (
                <span className="text-[11px] font-bold bg-orange text-white px-1.5 py-0.5 rounded-full">
                  {pendingTransfers}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-3 flex-shrink-0">
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full bg-orange flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {getInitials(user?.fullName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
            <p className="text-xs text-blue-200/60 truncate">{formatRole(user?.role)}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-200/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>
      </div>
    </>
  );
}
