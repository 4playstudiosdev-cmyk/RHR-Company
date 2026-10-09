import React, { useEffect, useState } from 'react';
import { HardHat, Users, CalendarCheck2, Wallet, Plus, Pencil, Trash2, Play } from 'lucide-react';
import api, { getCurrentUser } from '../services/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import CityFilter from '../components/CityFilter';

const TABS = [
  { key: 'heads', label: 'Head of Manufacturing', icon: HardHat },
  { key: 'workers', label: 'Workers', icon: Users },
  { key: 'payout', label: 'Attendance & Payout', icon: CalendarCheck2 },
  { key: 'earnings', label: 'Earnings Report', icon: Wallet },
];

const EMPTY_HEAD_FORM = { full_name: '', phone: '' };
const EMPTY_WORKER_FORM = { full_name: '', phone: '', head_id: '' };
const todayISO = () => new Date().toISOString().split('T')[0];

// PKR 10/bag on Tile Bond production: Rs 1/bag straight to the Head
// (whether present or not), remaining Rs 9/bag split across Workers
// marked present that day — see manufacturing.controller.js for the
// actual calculation (this is display-only duplication of the same math
// for the live preview below).
const RATE_PER_BAG = 10;
const HEAD_SHARE = 1;
const WORKER_POOL_SHARE = RATE_PER_BAG - HEAD_SHARE;

export default function ManufacturingEmployees() {
  const toast = useToast();
  const user = getCurrentUser();
  const defaultCity = user?.role === 'super_admin' ? '1e5962c6-33a7-460b-913e-9e08db46973a' : user?.companyId;
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [tab, setTab] = useState('heads');

  const [heads, setHeads] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showHeadModal, setShowHeadModal] = useState(false);
  const [editingHead, setEditingHead] = useState(null);
  const [headForm, setHeadForm] = useState(EMPTY_HEAD_FORM);
  const [savingHead, setSavingHead] = useState(false);

  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [workerForm, setWorkerForm] = useState(EMPTY_WORKER_FORM);
  const [savingWorker, setSavingWorker] = useState(false);

  // Attendance & Payout tab
  const [payoutHeadId, setPayoutHeadId] = useState('');
  const [payoutDate, setPayoutDate] = useState(todayISO());
  const [attendance, setAttendance] = useState([]); // [{id, full_name, present}]
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  // Bags produced is never typed by hand — it's always pulled from that
  // day's real Daily Production Entry log (Tile Bond category only), so
  // the payout can never drift from what was actually produced.
  const [productionBags, setProductionBags] = useState({ total_bags: 0, runs: [] });
  const [loadingBags, setLoadingBags] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [lastPayout, setLastPayout] = useState(null);

  // Earnings tab
  const [earnings, setEarnings] = useState([]);
  const [earningsHeadId, setEarningsHeadId] = useState('all');
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  const companyFilter = selectedCity === 'all' ? null : selectedCity;

  useEffect(() => {
    loadHeadsAndWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const loadHeadsAndWorkers = async () => {
    setLoading(true);
    try {
      const params = companyFilter ? { company_id: companyFilter } : {};
      const [headsRes, workersRes] = await Promise.all([
        api.get('/manufacturing/heads', { params }),
        api.get('/manufacturing/workers', { params }),
      ]);
      setHeads(headsRes.data.data || []);
      setWorkers(workersRes.data.data || []);
    } catch (err) {
      toast.error('Failed to load manufacturing employees.');
    } finally {
      setLoading(false);
    }
  };

  // ── Heads ──
  const openAddHead = () => { setEditingHead(null); setHeadForm(EMPTY_HEAD_FORM); setShowHeadModal(true); };
  const openEditHead = (h) => { setEditingHead(h); setHeadForm({ full_name: h.full_name, phone: h.phone || '' }); setShowHeadModal(true); };

  const handleSaveHead = async (e) => {
    e.preventDefault();
    if (!headForm.full_name.trim()) { toast.error('Name is required.'); return; }
    setSavingHead(true);
    try {
      if (editingHead) {
        await api.patch(`/manufacturing/heads/${editingHead.id}`, headForm);
        toast.success('Head updated.');
      } else {
        await api.post('/manufacturing/heads', { ...headForm, company_id: companyFilter });
        toast.success('Head added.');
      }
      setShowHeadModal(false);
      loadHeadsAndWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save.');
    } finally {
      setSavingHead(false);
    }
  };

  const handleDeleteHead = async (h) => {
    if (!window.confirm(`Remove "${h.full_name}" as Head of Manufacturing?`)) return;
    try {
      await api.delete(`/manufacturing/heads/${h.id}`);
      toast.success('Head removed.');
      loadHeadsAndWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove.');
    }
  };

  // ── Workers ──
  const openAddWorker = () => { setEditingWorker(null); setWorkerForm({ ...EMPTY_WORKER_FORM, head_id: heads[0]?.id || '' }); setShowWorkerModal(true); };
  const openEditWorker = (w) => { setEditingWorker(w); setWorkerForm({ full_name: w.full_name, phone: w.phone || '', head_id: w.head_id }); setShowWorkerModal(true); };

  const handleSaveWorker = async (e) => {
    e.preventDefault();
    if (!workerForm.full_name.trim() || !workerForm.head_id) { toast.error('Name and Head are required.'); return; }
    setSavingWorker(true);
    try {
      if (editingWorker) {
        await api.patch(`/manufacturing/workers/${editingWorker.id}`, workerForm);
        toast.success('Worker updated.');
      } else {
        await api.post('/manufacturing/workers', { ...workerForm, company_id: companyFilter });
        toast.success('Worker added.');
      }
      setShowWorkerModal(false);
      loadHeadsAndWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save.');
    } finally {
      setSavingWorker(false);
    }
  };

  const handleDeleteWorker = async (w) => {
    if (!window.confirm(`Remove "${w.full_name}" from the team?`)) return;
    try {
      await api.delete(`/manufacturing/workers/${w.id}`);
      toast.success('Worker removed.');
      loadHeadsAndWorkers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove.');
    }
  };

  // ── Attendance & Payout ──
  useEffect(() => {
    if (tab === 'payout' && payoutHeadId && payoutDate) loadAttendance();
    if (tab === 'payout' && payoutDate && companyFilter) loadProductionBags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, payoutHeadId, payoutDate, companyFilter]);

  const loadAttendance = async () => {
    setLoadingAttendance(true);
    setLastPayout(null);
    try {
      const res = await api.get('/manufacturing/attendance', { params: { head_id: payoutHeadId, date: payoutDate } });
      setAttendance((res.data.data || []).map((w) => ({ ...w, present: w.present ?? true })));
    } catch (err) {
      toast.error('Failed to load attendance.');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const loadProductionBags = async () => {
    setLoadingBags(true);
    try {
      const res = await api.get('/manufacturing/production-bags', { params: { company_id: companyFilter, date: payoutDate } });
      setProductionBags(res.data.data || { total_bags: 0, runs: [] });
    } catch (err) {
      setProductionBags({ total_bags: 0, runs: [] });
    } finally {
      setLoadingBags(false);
    }
  };

  const toggleAttendance = (workerId) => {
    setAttendance((prev) => prev.map((w) => (w.id === workerId ? { ...w, present: !w.present } : w)));
  };

  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    try {
      await api.post('/manufacturing/attendance', {
        date: payoutDate,
        entries: attendance.map((w) => ({ worker_id: w.id, present: !!w.present })),
      });
      toast.success('Attendance saved.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setSavingAttendance(false);
    }
  };

  const presentCount = attendance.filter((w) => w.present).length;
  const bagsNum = Number(productionBags.total_bags) || 0;
  const previewHeadAmount = bagsNum * HEAD_SHARE;
  const previewPool = bagsNum * WORKER_POOL_SHARE;
  const previewPerWorker = presentCount > 0 ? previewPool / presentCount : 0;

  const handleCalculatePayout = async () => {
    if (!payoutHeadId) { toast.error('Select a Head.'); return; }
    if (!bagsNum || bagsNum <= 0) {
      toast.error('No Tile Bond production logged for this date yet — log it in Daily Production Entry first.');
      return;
    }
    setCalculating(true);
    try {
      await handleSaveAttendance();
      // bags_produced is deliberately not sent — the backend always
      // re-derives it from the real production log, never trusts the client.
      const res = await api.post('/manufacturing/payout', {
        head_id: payoutHeadId,
        date: payoutDate,
      });
      setLastPayout(res.data.data);
      toast.success(res.data.message || 'Payout calculated.');
      if (tab === 'earnings') loadEarnings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to calculate payout.');
    } finally {
      setCalculating(false);
    }
  };

  // ── Earnings ──
  useEffect(() => {
    if (tab === 'earnings') loadEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedCity, earningsHeadId]);

  const loadEarnings = async () => {
    setLoadingEarnings(true);
    try {
      const params = companyFilter ? { company_id: companyFilter } : {};
      if (earningsHeadId !== 'all') params.head_id = earningsHeadId;
      const res = await api.get('/manufacturing/earnings', { params });
      setEarnings(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load earnings.');
    } finally {
      setLoadingEarnings(false);
    }
  };

  const earningsTotal = earnings.reduce((s, e) => s + Number(e.amount), 0);
  const payoutHeadWorkers = workers.filter((w) => w.head_id === payoutHeadId);

  return (
    <div className="p-6">
      <PageHeader
        title="Manufacturing Employees"
        subtitle="Head of Manufacturing + their workers — PKR 10/bag on Tile Bond production (Rs 1 to the Head, Rs 9 split across present workers)"
        action={<CityFilter selectedCity={selectedCity} onChange={setSelectedCity} />}
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'heads' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="accent" onClick={openAddHead} className="flex items-center gap-2">
              <Plus size={16} /> Add Head
            </Button>
          </div>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loading ? (
              <SkeletonTable rows={4} cols={4} />
            ) : heads.length === 0 ? (
              <EmptyState icon={HardHat} title="No Heads of Manufacturing yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Workers</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heads.map((h, i) => (
                      <tr key={h.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">{h.full_name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{h.phone || '—'}</td>
                        <td className="px-6 py-3.5 text-right text-gray-700">{workers.filter((w) => w.head_id === h.id).length}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => openEditHead(h)} className="text-navy hover:bg-navy/10 p-1.5 rounded-lg transition-colors" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteHead(h)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Remove">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'workers' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="accent" onClick={openAddWorker} disabled={heads.length === 0} className="flex items-center gap-2">
              <Plus size={16} /> Add Worker
            </Button>
          </div>
          {heads.length === 0 && (
            <p className="text-xs text-gray-400 mb-4">Add a Head of Manufacturing first — workers must be assigned to one.</p>
          )}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            {loading ? (
              <SkeletonTable rows={5} cols={4} />
            ) : workers.length === 0 ? (
              <EmptyState icon={Users} title="No workers yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Head of Manufacturing</th>
                      <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((w, i) => (
                      <tr key={w.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-6 py-3.5 font-medium text-navy">{w.full_name}</td>
                        <td className="px-6 py-3.5 text-gray-600">{w.phone || '—'}</td>
                        <td className="px-6 py-3.5 text-gray-600">{w.manufacturing_heads?.full_name || '—'}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => openEditWorker(w)} className="text-navy hover:bg-navy/10 p-1.5 rounded-lg transition-colors" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteWorker(w)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Remove">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'payout' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-white rounded-2xl shadow-card border border-gray-100 p-5 h-fit">
            <h3 className="font-semibold text-navy text-sm mb-4">Select Team & Date</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Head of Manufacturing</label>
                <select
                  value={payoutHeadId}
                  onChange={(e) => setPayoutHeadId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
                >
                  <option value="">— Select —</option>
                  {heads.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={payoutDate}
                  max={todayISO()}
                  onChange={(e) => setPayoutDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>

            {payoutHeadId && (
              <>
                <h4 className="font-semibold text-navy text-xs uppercase tracking-wide mt-5 mb-2">Mark Attendance</h4>
                {loadingAttendance ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
                ) : payoutHeadWorkers.length === 0 ? (
                  <p className="text-xs text-gray-400">No workers under this Head yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {attendance.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleAttendance(w.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                          w.present ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
                        }`}
                      >
                        <span>{w.full_name}</span>
                        <span className="text-xs font-semibold">{w.present ? 'Present' : 'Absent'}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-5">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tile Bond Bags Produced (from Daily Production Entry)</label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy">
                    {loadingBags ? 'Loading...' : bagsNum.toLocaleString()}
                  </div>
                  {!loadingBags && productionBags.runs?.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      {productionBags.runs.map((r) => `${r.product_name} (${r.qty_produced})`).join(', ')}
                    </p>
                  )}
                  {!loadingBags && bagsNum === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      No Tile Bond production logged for this date yet — log it under Production → Daily Production Entry first.
                    </p>
                  )}
                </div>

                {bagsNum > 0 && (
                  <div className="mt-4 bg-navy-chip/30 rounded-lg px-3.5 py-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-600">Head's share (PKR {HEAD_SHARE}/bag)</span><span className="font-semibold text-navy">PKR {previewHeadAmount.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Worker pool (PKR {WORKER_POOL_SHARE}/bag)</span><span className="font-semibold text-navy">PKR {previewPool.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Present workers</span><span className="font-semibold text-navy">{presentCount}</span></div>
                    <div className="flex justify-between border-t border-navy-chip pt-1 mt-1"><span className="text-gray-600">Each present worker gets</span><span className="font-bold text-orange">PKR {previewPerWorker.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                  </div>
                )}

                <Button
                  variant="accent"
                  onClick={handleCalculatePayout}
                  disabled={calculating || savingAttendance}
                  className="w-full flex items-center justify-center gap-2 mt-4"
                >
                  <Play size={15} /> {calculating ? 'Calculating...' : 'Save Attendance & Calculate Payout'}
                </Button>

                {lastPayout && (
                  <div className="mt-3 border border-emerald-200 bg-emerald-50 rounded-lg p-3 text-xs text-emerald-900">
                    Saved: PKR {lastPayout.head_amount.toLocaleString()} to Head, PKR {lastPayout.per_worker_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} each to {lastPayout.present_worker_count} worker(s).
                    {lastPayout.unallocated > 0 && (
                      <span className="block mt-1 text-amber-700">PKR {lastPayout.unallocated.toLocaleString()} unallocated — no workers were present.</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="lg:col-span-7 bg-white rounded-2xl shadow-card border border-gray-100 p-5">
            <h3 className="font-semibold text-navy text-sm mb-2">How this works</h3>
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
              <li>The client pays PKR 10 per bag on Tile Bond production.</li>
              <li>Bags produced is never typed by hand — it's pulled straight from that day's real Daily Production Entry log for any Tile Bond category product, so it can never drift from what was actually made.</li>
              <li>PKR 1/bag always goes to the Head of Manufacturing for that team — whether the Head was personally present that day or not.</li>
              <li>The remaining PKR 9/bag is split evenly across whichever Workers are marked <strong>Present</strong> above.</li>
              <li>Mark attendance, then calculate — re-running for the same Head + date replaces that day's numbers instead of duplicating them.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'earnings' && (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3 bg-gray-50/50">
            <select
              value={earningsHeadId}
              onChange={(e) => setEarningsHeadId(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
            >
              <option value="all">— All Teams —</option>
              {heads.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
            </select>
            <span className="text-sm font-semibold text-navy">Total: PKR {earningsTotal.toLocaleString()}</span>
          </div>
          {loadingEarnings ? (
            <SkeletonTable rows={6} cols={6} />
          ) : earnings.length === 0 ? (
            <EmptyState icon={Wallet} title="No payouts recorded yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Head Team</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Person</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Role</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Bags</th>
                    <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((e, i) => (
                    <tr key={e.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      <td className="px-6 py-3.5 text-gray-500 whitespace-nowrap">{new Date(e.earning_date).toLocaleDateString('en-GB')}</td>
                      <td className="px-6 py-3.5 text-gray-600">{e.manufacturing_heads?.full_name || '—'}</td>
                      <td className="px-6 py-3.5 font-medium text-navy">{e.role === 'head' ? e.manufacturing_heads?.full_name : e.manufacturing_workers?.full_name}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${e.role === 'head' ? 'bg-navy-chip text-navy' : 'bg-orange/10 text-orange'}`}>
                          {e.role === 'head' ? 'Head' : 'Worker'}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right text-gray-700">{e.bags_produced}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-green-700">PKR {Number(e.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showHeadModal && (
        <Modal title={editingHead ? 'Edit Head' : 'Add Head of Manufacturing'} onClose={() => setShowHeadModal(false)}>
          <form onSubmit={handleSaveHead} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={headForm.full_name}
                onChange={(e) => setHeadForm({ ...headForm, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="text"
                value={headForm.phone}
                onChange={(e) => setHeadForm({ ...headForm, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowHeadModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={savingHead}>{savingHead ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {showWorkerModal && (
        <Modal title={editingWorker ? 'Edit Worker' : 'Add Worker'} onClose={() => setShowWorkerModal(false)}>
          <form onSubmit={handleSaveWorker} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={workerForm.full_name}
                onChange={(e) => setWorkerForm({ ...workerForm, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="text"
                value={workerForm.phone}
                onChange={(e) => setWorkerForm({ ...workerForm, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Head of Manufacturing *</label>
              <select
                required
                value={workerForm.head_id}
                onChange={(e) => setWorkerForm({ ...workerForm, head_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy bg-white"
              >
                <option value="">— Select —</option>
                {heads.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowWorkerModal(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={savingWorker}>{savingWorker ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
