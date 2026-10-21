import React, { useState } from 'react';
import { Minus, Plus, Info } from 'lucide-react';
import Modal from './Modal';
import { GROUT_COLORS, GROUT_STEP, groutHex } from '../utils/groutColors';

// Colour picker for a Grout product on an order: 24 colour circles (click one to
// add a set of 6, click again for another set), and the chosen colours below,
// each with its own quantity (−/+ in sets of 6, or typed). The same picker as
// the apps, so an order from anyone looks the same.
// onConfirm receives { colourName: packets } for the colours with a quantity.
export default function GroutColorPicker({ productName, price, initial = {}, onConfirm, onClose }) {
  const [qty, setQty] = useState({ ...initial });

  const bump = (color, delta) => setQty((prev) => {
    const next = (prev[color] || 0) + delta;
    const copy = { ...prev };
    if (next <= 0) delete copy[color]; else copy[color] = next;
    return copy;
  });
  const setExact = (color, value) => setQty((prev) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    const copy = { ...prev };
    if (n <= 0) delete copy[color]; else copy[color] = n;
    return copy;
  });

  const lines = Object.entries(qty);
  const totalQty = lines.reduce((s, [, q]) => s + q, 0);

  return (
    <Modal title={productName || 'Grout'} onClose={onClose} size="lg">
      <p className="text-sm text-gray-500 -mt-2 mb-1">PKR {Number(price || 0).toLocaleString()} per packet</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-teal-600 mb-4">
        <Info size={14} /> Har rang {GROUT_STEP} packet ke set mein
      </p>

      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Rang chunein ({GROUT_COLORS.length} colours)</p>
      <div className="grid grid-cols-6 gap-x-2 gap-y-4 mb-6">
        {GROUT_COLORS.map((c) => {
          const q = qty[c.name] || 0;
          return (
            <button
              type="button"
              key={c.name}
              onClick={() => bump(c.name, GROUT_STEP)}
              className="flex flex-col items-center gap-1.5 focus:outline-none"
              title={`Add ${GROUT_STEP} × ${c.name}`}
            >
              <span className="relative">
                <span
                  className={`block w-11 h-11 rounded-full border ${q > 0 ? 'ring-[3px] ring-teal-500 border-white' : 'border-gray-300'}`}
                  style={{ backgroundColor: c.hex }}
                />
                {q > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center">{q}</span>
                )}
              </span>
              <span className={`text-[11px] leading-tight text-center ${q > 0 ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{c.name}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Aapka order ({lines.length} rang)</p>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-5">Upar se rang chunein</p>
      ) : (
        <div className="space-y-2">
          {lines.map(([color, q]) => (
            <div key={color} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <span className="w-6 h-6 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: groutHex(color) }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{color}</p>
                <p className="text-xs text-gray-400">PKR {(q * Number(price || 0)).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => bump(color, -GROUT_STEP)} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-white flex items-center justify-center"><Minus size={14} /></button>
              <input
                type="number"
                min={0}
                value={q}
                onChange={(e) => setExact(color, e.target.value)}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
              />
              <button type="button" onClick={() => bump(color, GROUT_STEP)} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-white flex items-center justify-center"><Plus size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Total</p>
          <p className="text-base font-bold text-navy">{totalQty} packets · PKR {(totalQty * Number(price || 0)).toLocaleString()}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => onConfirm(qty)} className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">Done</button>
        </div>
      </div>
    </Modal>
  );
}
