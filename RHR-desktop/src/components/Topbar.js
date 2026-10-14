import React from 'react';
import { Search } from 'lucide-react';
import QuickActionMenu from './QuickActionMenu';

// Desktop-only (the mobile header in App.js already carries the
// hamburger + title bar) — a persistent strip above every page with a
// Ctrl+K search trigger and the Quick Action shortcuts, both reachable
// from any tab instead of needing per-page affordances.
export default function Topbar({ onOpenSearch, onQuickAction, companyLabel }) {
  return (
    <header className="hidden md:flex items-center gap-4 px-6 py-3 bg-white border-b border-gray-100 flex-shrink-0">
      <button
        onClick={onOpenSearch}
        className="flex-1 max-w-md flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3.5 py-2 text-left transition-colors"
      >
        <Search size={16} className="text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-400 flex-1 truncate">Quick search orders, dealers, products, recipes...</span>
        <kbd className="text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      <QuickActionMenu onTrigger={onQuickAction} />

      {companyLabel && (
        <span className="text-xs text-gray-400 whitespace-nowrap hidden lg:inline">{companyLabel}</span>
      )}
    </header>
  );
}
