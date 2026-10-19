import React, { useEffect, useMemo, useState } from 'react';
import { Smartphone, Search, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/PageHeader';
import CityFilter from '../components/CityFilter';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

// Super admin only: switch individual parts of the mobile apps on or off for
// each customer, salesman and driver. What's available to switch is defined
// in the backend (RHR-backend/src/utils/appFeatures.js). A switch that was
// never touched shows its default (on — except a driver's "Sales access").
// The apps pick the change up the next time they open or come to the front.
const ROLE_TABS = [
  { key: 'customer', label: 'Customers' },
  { key: 'salesman', label: 'Salesmen' },
  { key: 'driver', label: 'Drivers' },
];

function Switch({ on, disabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function MobileAccess() {
  const toast = useToast();
  const [role, setRole] = useState('driver');
  const [city, setCity] = useState('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState({}); // `${id}:${feature}` -> true

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api.get('/admins/mobile-access', { params: { role, company_id: city } })
      .then((res) => alive && setData(res.data.data))
      .catch((err) => alive && setError(err.response?.data?.message || 'Failed to load accounts.'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [role, city]);

  const accounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.accounts || [];
    if (!q) return list;
    return list.filter((a) => [a.name, a.contact, a.phone].some((t) => (t || '').toLowerCase().includes(q)));
  }, [data, search]);

  const setFeature = async (account, feature, value) => {
    const k = `${account.id}:${feature}`;
    setSaving((s) => ({ ...s, [k]: true }));
    // optimistic
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === account.id ? { ...a, features: { ...a.features, [feature]: value } } : a)) }));
    try {
      await api.patch('/admins/mobile-access', { role, id: account.id, feature, value });
    } catch (err) {
      setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === account.id ? { ...a, features: { ...a.features, [feature]: !value } } : a)) }));
      toast.error(err.response?.data?.message || 'Could not save.');
    } finally {
      setSaving((s) => { const n = { ...s }; delete n[k]; return n; });
    }
  };

  const catalog = data?.catalog || [];

  return (
    <div className="p-6">
      <PageHeader
        title="Mobile Access"
        subtitle="Choose which parts of the app each customer, salesman and driver can use"
        action={<CityFilter selectedCity={city} onChange={setCity} />}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex gap-2">
          {ROLE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRole(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                role === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-chip focus:border-navy"
          />
        </div>
      </div>

      {data?.needsSql && (
        <div className="mb-4 flex items-start gap-2 bg-orange/10 border border-orange/30 text-navy px-4 py-3 rounded-xl text-sm">
          <AlertTriangle size={16} className="text-orange mt-0.5 flex-shrink-0" />
          <span>
            Switches can't be saved yet — run <b>sql/phase69_mobile_features.sql</b> once in the Supabase SQL Editor, then refresh this page.
            Until then everyone keeps the default access.
          </span>
        </div>
      )}
      {role === 'driver' && (
        <p className="text-xs text-gray-500 mb-3">
          <b>Sales access</b> gives a driver salesman powers in the driver app: add customers (they become that driver's customers,
          with an optional salesman), see every customer of the branch, and place orders for any of them. Off by default.
        </p>
      )}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : accounts.length === 0 ? (
          <EmptyState icon={Smartphone} title="No accounts found" subtitle="Try another city or search" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide sticky left-0 bg-gray-50 min-w-[200px]">Account</th>
                  {catalog.map((f) => (
                    <th key={f.key} title={f.help || f.label} className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide text-center min-w-[96px]">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr key={a.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className={`px-5 py-3 sticky left-0 ${i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                      <p className="font-semibold text-navy">{a.name}</p>
                      <p className="text-xs text-gray-400">{[a.contact, a.phone].filter(Boolean).join(' · ')}</p>
                    </td>
                    {catalog.map((f) => (
                      <td key={f.key} className="px-3 py-3 text-center">
                        <Switch
                          on={!!a.features[f.key]}
                          disabled={!!saving[`${a.id}:${f.key}`] || data?.needsSql}
                          label={`${f.label} for ${a.name}`}
                          onChange={() => setFeature(a, f.key, !a.features[f.key])}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
