import React, { useState } from 'react';

const toISO = (d) => d.toISOString().split('T')[0];

function buildPresets() {
  const now = new Date();
  const today = toISO(now);
  const yesterday = toISO(new Date(Date.now() - 86400000));
  const sub7 = toISO(new Date(Date.now() - 7 * 86400000));
  const sub30 = toISO(new Date(Date.now() - 30 * 86400000));
  const sub90 = toISO(new Date(Date.now() - 90 * 86400000));

  // Last Week = Mon-Sun of the previous calendar week.
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const startOfLastWeek = toISO(new Date(now.getTime() - (dayOfWeek + 6) * 86400000));
  const endOfLastWeek = toISO(new Date(now.getTime() - dayOfWeek * 86400000));

  const startOfMonth = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const startOfLastMonth = toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const endOfLastMonth = toISO(new Date(now.getFullYear(), now.getMonth(), 0));

  return [
    { label: 'Today', getValue: () => ({ from: today, to: today }) },
    { label: 'Yesterday', getValue: () => ({ from: yesterday, to: yesterday }) },
    { label: 'Last 7 Days', getValue: () => ({ from: sub7, to: today }) },
    { label: 'Last Week', getValue: () => ({ from: startOfLastWeek, to: endOfLastWeek }) },
    { label: 'This Month', getValue: () => ({ from: startOfMonth, to: today }) },
    { label: 'Last Month', getValue: () => ({ from: startOfLastMonth, to: endOfLastMonth }) },
    { label: 'Last 30 Days', getValue: () => ({ from: sub30, to: today }) },
    { label: 'Last 90 Days', getValue: () => ({ from: sub90, to: today }) },
    { label: 'Custom Range', getValue: () => null },
  ];
}

/**
 * Quick-filter date range pills (Today/Yesterday/Last 7 Days/.../Custom
 * Range) used across every report-style page's date filter. A preset
 * (other than Custom Range) calls onApply(from, to) immediately; Custom
 * Range reveals manual date inputs and only calls onApply when the user
 * taps Apply, so typing in-progress dates doesn't fire a fetch per
 * keystroke.
 *
 * `from`/`to` are the page's current applied values — used only to
 * figure out which pill (if any) matches on first render, so a page
 * that already has a date range selected (e.g. restored from state)
 * shows the right pill highlighted instead of defaulting to one.
 */
export default function DateRangeFilter({ from, to, onApply, defaultPreset = 'This Month' }) {
  const presets = React.useMemo(buildPresets, []);

  const [activePreset, setActivePreset] = useState(() => {
    const match = presets.find((p) => {
      const v = p.getValue();
      return v && v.from === from && v.to === to;
    });
    return match ? match.label : (from || to) ? 'Custom Range' : defaultPreset;
  });
  const [customFrom, setCustomFrom] = useState(from || '');
  const [customTo, setCustomTo] = useState(to || '');

  const handlePresetSelect = (preset) => {
    setActivePreset(preset.label);
    if (preset.label === 'Custom Range') return;
    const range = preset.getValue();
    setCustomFrom(range.from);
    setCustomTo(range.to);
    onApply(range.from, range.to);
  };

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handlePresetSelect(preset)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activePreset === preset.label
                ? 'bg-navy text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {activePreset === 'Custom Range' && (
        <div className="flex gap-3 items-end mt-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To</label>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy transition-shadow"
            />
          </div>
          <button
            type="button"
            onClick={() => onApply(customFrom, customTo)}
            disabled={!customFrom || !customTo}
            className="bg-navy hover:bg-navy/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
