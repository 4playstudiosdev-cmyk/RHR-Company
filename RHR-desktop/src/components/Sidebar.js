import React, { useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, Users, UserCog, Wallet, LogOut,
  BookOpen, FileSpreadsheet, MapPin, Bell, Briefcase, Factory,
  Gauge, Boxes, ClipboardList, Truck, FileBarChart2, ChevronDown, Server
} from 'lucide-react';
import ServerSettingsModal from './ServerSettingsModal';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'salesmen', label: 'Salesmen', icon: UserCog },
  { key: 'payments', label: 'Payments', icon: Wallet },
  { key: 'ledger', label: 'Ledger', icon: BookOpen },
  { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { key: 'gps', label: 'Live GPS', icon: MapPin },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  {
    key: 'production',
    label: 'Production',
    icon: Factory,
    children: [
      { key: 'production-dashboard', label: 'Production Dashboard', icon: Gauge },
      { key: 'production-materials', label: 'Raw Materials', icon: Boxes },
      { key: 'production-orders', label: 'Production Orders', icon: ClipboardList },
      { key: 'production-dispatch', label: 'Dispatch', icon: Truck },
      { key: 'production-reports', label: 'Production Reports', icon: FileBarChart2 }
    ]
  },
  { key: 'hrm', label: 'HRM', icon: Briefcase }
];

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

export default function Sidebar({ page, setPage, user, onLogout }) {
  const [productionOpen, setProductionOpen] = useState(page.startsWith('production-'));
  const [showServerSettings, setShowServerSettings] = useState(false);

  return (
    <div className="w-64 bg-navy text-white flex flex-col h-screen flex-shrink-0 overflow-hidden">
      <div className="px-6 py-6 border-b border-white/10 flex-shrink-0">
        <h1 className="text-xl font-bold tracking-wide text-white">RHR & Company</h1>
        <p className="text-xs text-blue-200/70 mt-1">Admin Desktop Panel</p>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-5 space-y-1.5">
        {NAV_ITEMS.map((item) => {
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
              <span>{item.label}</span>
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
          onClick={() => setShowServerSettings(true)}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-200/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Server size={18} strokeWidth={2} />
          <span>Server Settings</span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-blue-200/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={18} strokeWidth={2} />
          <span>Logout</span>
        </button>
      </div>

      {showServerSettings && <ServerSettingsModal onClose={() => setShowServerSettings(false)} />}
    </div>
  );
}
