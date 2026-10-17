import React, { useCallback, useEffect, useState } from 'react';
import { Factory } from 'lucide-react';
import api from '../../services/api';
import EmptyState from '../../components/EmptyState';

// Shared by the Production Dashboard and the Production Reports → Daily
// report: loads GET /production/summary for a date range and renders the
// day-by-day "what was produced" table, so both screens always agree.

export const todayISO = () => new Date().toISOString().split('T')[0];

export const fmtNum = (n, digits = 0) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

export const fmtKg = (n) => fmtNum(n, 1);

// { bag: 20, pcs: 5 } -> "20 bag · 5 pcs"
export function unitBreakdown(byUnit) {
  const parts = Object.entries(byUnit || {}).map(([unit, qty]) => `${fmtNum(qty)} ${unit}`);
  return parts.length ? parts.join(' · ') : '0';
}

export function rangeLabel(from, to) {
  if (!from && !to) return 'All time';
  if (from && from === to) return from;
  return `${from || 'Start'} to ${to || 'Today'}`;
}

// Flat rows for PDF / Excel: one per product per day, in the same order
// as the on-screen table.
export function summaryExportRows(days) {
  return (days || []).flatMap((d) =>
    d.items.map((it) => [d.date, it.product, it.qty, it.unit, Number(it.kg.toFixed(1)), Math.round(it.cost)])
  );
}

export function useProductionSummary({ from, to, companyFilter }) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const params = {};
      if (companyFilter) params.company_id = companyFilter;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await api.get('/production/summary', { params });
      setState({ data: res.data.data, loading: false, error: '' });
    } catch (err) {
      setState({ data: null, loading: false, error: err.response?.data?.message || 'Failed to load production summary.' });
    }
  }, [from, to, companyFilter]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}

// One block per day: each product made that day, then a day total.
export function DayBreakdownTable({ days }) {
  if (!days || days.length === 0) {
    return <EmptyState icon={Factory} title="No production logged in this period" subtitle="Production entered in Daily Production Entry shows up here" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Product</th>
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Produced</th>
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Weight (kg)</th>
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Cost (PKR)</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <React.Fragment key={d.date}>
              {d.items.map((it, i) => (
                <tr key={it.product} className="border-b border-gray-50 hover:bg-gray-50/70">
                  <td className="px-6 py-2.5 text-gray-500 whitespace-nowrap">{i === 0 ? d.date : ''}</td>
                  <td className="px-6 py-2.5 text-gray-700">{it.product}</td>
                  <td className="px-6 py-2.5 text-right text-navy font-medium">{fmtNum(it.qty)} {it.unit}</td>
                  <td className="px-6 py-2.5 text-right text-gray-600">{it.kg ? fmtKg(it.kg) : '—'}</td>
                  <td className="px-6 py-2.5 text-right text-gray-600">{fmtNum(it.cost)}</td>
                </tr>
              ))}
              <tr className="bg-navy-chip/30 border-b border-gray-100">
                <td className="px-6 py-2 font-bold text-navy text-xs uppercase tracking-wide" colSpan={2}>Total — {d.date}</td>
                <td className="px-6 py-2 text-right font-bold text-navy">
                  {unitBreakdown(d.items.reduce((m, it) => ({ ...m, [it.unit]: (m[it.unit] || 0) + it.qty }), {}))}
                </td>
                <td className="px-6 py-2 text-right font-bold text-navy">{fmtKg(d.kg)}</td>
                <td className="px-6 py-2 text-right font-bold text-navy">{fmtNum(d.cost)}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
