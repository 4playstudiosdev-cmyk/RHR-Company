import React, { useEffect, useRef, useState } from 'react';
import { Plus, ShoppingCart, Factory, HandCoins, UserPlus, Receipt } from 'lucide-react';

// Each action navigates to the page that owns that form/modal, and —
// for the three with a dismissible "create" modal — asks it to open
// immediately via onTrigger's autoOpen token (see App.js's
// quickActionTarget). Recovery and Expenses have no modal to open at
// all; their "Record ..." form is always on-page already, so just
// landing there is the whole action.
const ACTIONS = [
  { key: 'orders', label: 'New Sales Order', icon: ShoppingCart, autoOpen: true },
  { key: 'production-orders', label: 'Daily Production Batch', icon: Factory, autoOpen: true },
  { key: 'recovery', label: 'Record Payment Recovery', icon: HandCoins, autoOpen: false },
  { key: 'customers', label: 'Register Dealer Account', icon: UserPlus, autoOpen: true },
  { key: 'expenses', label: 'Record Expense Voucher', icon: Receipt, autoOpen: false },
];

export default function QuickActionMenu({ onTrigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={15} /> Quick Action
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
          <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Fast ERP Actions</p>
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => { onTrigger(a.key, a.autoOpen); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left"
            >
              <a.icon size={16} className="text-navy flex-shrink-0" />
              <span className="text-sm font-medium text-navy">{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
