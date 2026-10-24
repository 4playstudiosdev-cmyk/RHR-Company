import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { customerLabel } from '../utils/customerLabel';

// A customer picker you can TYPE in: a long list of customers is searched by shop name, owner
// name, phone, city or area as you type, instead of scrolling a plain dropdown.
//
// Drop-in for the old <select>: `onChange` receives an event-like object ({ target: { value } })
// so the existing handlers (e.target.value) keep working unchanged. Keyboard: ↑ ↓ to move,
// Enter to pick, Esc to close.
export default function CustomerSelect({
  value, onChange, customers = [], placeholder = 'Select customer...', disabled = false,
  showPhone = false, className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = customers.find((c) => c.id === value) || null;
  const labelOf = (c) => customerLabel(c) + (showPhone && c.phone ? ` (${c.phone})` : '');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const words = q.split(/\s+/);
    return customers.filter((c) => {
      const hay = [c.shop_name, c.full_name, c.phone, c.whatsapp_phone, c.city, c.area].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [customers, query]);

  // close when clicking anywhere outside
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  // keep the highlighted row in view while moving with the arrow keys
  useEffect(() => {
    const el = listRef.current?.children?.[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (c) => {
    onChange({ target: { value: c ? c.id : '' } });
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open) { e.preventDefault(); if (matches[active]) pick(matches[active]); } }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-2 w-full border rounded-lg px-3 py-2.5 text-sm bg-white transition-shadow ${
          open ? 'border-navy ring-2 ring-navy' : 'border-gray-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-text'}`}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
      >
        <Search size={15} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : (selected ? labelOf(selected) : '')}
          placeholder={selected && open ? labelOf(selected) : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-transparent outline-none text-gray-800 placeholder-gray-400"
          autoComplete="off"
        />
        {selected && !disabled && (
          <button
            type="button"
            title="Clear"
            onMouseDown={(e) => { e.preventDefault(); pick(null); }}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            <X size={15} />
          </button>
        )}
        <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400">No customer matches “{query}”</p>
            ) : matches.map((c, i) => (
              <button
                type="button"
                key={c.id}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 text-sm flex flex-col ${i === active ? 'bg-navy-chip' : ''} ${c.id === value ? 'font-semibold text-navy' : 'text-gray-700'}`}
              >
                <span>{c.shop_name || c.full_name}</span>
                <span className="text-[11px] text-gray-400">
                  {[c.shop_name && c.full_name && c.shop_name.trim().toLowerCase() !== c.full_name.trim().toLowerCase() ? c.full_name : null, c.phone, c.area || c.city].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">{matches.length} of {customers.length} customers</div>
        </div>
      )}
    </div>
  );
}
