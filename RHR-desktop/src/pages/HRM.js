import React, { useEffect, useState, useCallback } from 'react';
import { Briefcase, Clock, DollarSign, CalendarCheck, Download } from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const TABS = [
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'salary', label: 'Salary', icon: DollarSign },
  { key: 'leave', label: 'Leave', icon: CalendarCheck }
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const now = new Date();

export default function HRM() {
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState('attendance');

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    try {
      const res = await api.get('/salesmen');
      setStaff(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load staff list.');
    }
  };

  return (
    <div className="p-6">
      <PageHeader title="HRM" subtitle="Attendance, salary and leave management for field staff" />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
          >
            <option value="">— Select an employee —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} ({s.phone})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-navy text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {!userId ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState icon={Briefcase} title="Select an employee" subtitle="Choose an employee above to manage their records" />
        </div>
      ) : tab === 'attendance' ? (
        <AttendanceTab userId={userId} month={month} year={year} toast={toast} />
      ) : tab === 'salary' ? (
        <SalaryTab userId={userId} month={month} year={year} toast={toast} />
      ) : (
        <LeaveTab userId={userId} toast={toast} />
      )}
    </div>
  );
}

function AttendanceTab({ userId, month, year, toast }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ presentDays: 0, lateDays: 0, absentDays: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markForm, setMarkForm] = useState({ date: '', status: 'present', notes: '' });
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/hrm/attendance/${userId}`, { params: { month, year } });
      setRecords(res.data.data.records || []);
      setSummary(res.data.data.summary || { presentDays: 0, lateDays: 0, absentDays: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [userId, month, year]);

  useEffect(() => { load(); }, [load]);

  const handleMark = async (e) => {
    e.preventDefault();
    if (!markForm.date) {
      toast.error('Date is required.');
      return;
    }
    setMarking(true);
    try {
      await api.post('/hrm/attendance/manual', { user_id: userId, ...markForm });
      toast.success('Attendance marked.');
      setMarkForm({ date: '', status: 'present', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance.');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-green-600">{summary.presentDays}</p>
          <p className="text-sm text-gray-500 mt-0.5">Present Days</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-orange">{summary.lateDays}</p>
          <p className="text-sm text-gray-500 mt-0.5">Late Days</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-red-600">{summary.absentDays}</p>
          <p className="text-sm text-gray-500 mt-0.5">Absent Days</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-semibold text-navy mb-3 text-sm">Mark Attendance Manually</h3>
        <form onSubmit={handleMark} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Date</label>
            <input
              type="date"
              value={markForm.date}
              onChange={(e) => setMarkForm({ ...markForm, date: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
            <select
              value={markForm.status}
              onChange={(e) => setMarkForm({ ...markForm, status: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
            <input
              type="text"
              value={markForm.notes}
              onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <Button type="submit" variant="accent" disabled={marking}>
            {marking ? 'Saving...' : 'Mark'}
          </Button>
        </form>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {records.length === 0 ? (
            <EmptyState icon={Clock} title="No attendance records for this period" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Date</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Check In</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Check Out</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={r.id || i} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5 text-gray-600">{r.date}</td>
                    <td className="px-6 py-3.5 text-gray-600">{r.check_in ? new Date(r.check_in).toLocaleTimeString('en-GB') : '—'}</td>
                    <td className="px-6 py-3.5 text-gray-600">{r.check_out ? new Date(r.check_out).toLocaleTimeString('en-GB') : '—'}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                        r.status === 'present' ? 'bg-green-100 text-green-800' :
                        r.status === 'absent' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {r.status}{r.is_late ? ' (late)' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SalaryTab({ userId, month, year, toast }) {
  const [structureForm, setStructureForm] = useState({ basic_salary: '', allowances: '', deductions: '', working_days: 26 });
  const [saving, setSaving] = useState(false);
  const [salary, setSalary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noStructure, setNoStructure] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNoStructure(false);
    setSalary(null);
    try {
      const res = await api.get(`/hrm/salary/${userId}`, { params: { month, year } });
      setSalary(res.data.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setNoStructure(true);
      } else {
        toast.error(err.response?.data?.message || 'Failed to load salary.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, month, year, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!structureForm.basic_salary) {
      toast.error('Basic salary is required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/hrm/salary/setup', { user_id: userId, ...structureForm });
      toast.success('Salary structure saved.');
      setStructureForm({ basic_salary: '', allowances: '', deductions: '', working_days: 26 });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save salary structure.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPayslip = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/hrm/payslip/${userId}`, {
        params: { month, year },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `payslip-${userId}-${month}-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download payslip.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-semibold text-navy mb-3 text-sm">Salary Structure</h3>
        <form onSubmit={handleSetup} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Basic Salary *</label>
            <input
              type="number" min="0" required
              value={structureForm.basic_salary}
              onChange={(e) => setStructureForm({ ...structureForm, basic_salary: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Allowances</label>
            <input
              type="number" min="0"
              value={structureForm.allowances}
              onChange={(e) => setStructureForm({ ...structureForm, allowances: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Deductions</label>
            <input
              type="number" min="0"
              value={structureForm.deductions}
              onChange={(e) => setStructureForm({ ...structureForm, deductions: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Working Days</label>
            <input
              type="number" min="1"
              value={structureForm.working_days}
              onChange={(e) => setStructureForm({ ...structureForm, working_days: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 flex justify-end">
            <Button type="submit" variant="accent" disabled={saving}>
              {saving ? 'Saving...' : 'Save Structure'}
            </Button>
          </div>
        </form>
      </div>

      {loading ? (
        <SkeletonTable rows={3} cols={2} />
      ) : noStructure ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <EmptyState icon={DollarSign} title="No salary structure set up yet" subtitle="Use the form above to set this employee's basic salary" />
        </div>
      ) : salary && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-navy">Calculated Salary — {salary.period}</h3>
            <Button variant="secondary" onClick={handleDownloadPayslip} disabled={downloading} className="flex items-center gap-2 text-xs">
              <Download size={14} /> {downloading ? 'Downloading...' : 'Download Payslip'}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-400 text-xs">Present Days</p><p className="font-medium text-navy">{salary.presentDays}</p></div>
            <div><p className="text-gray-400 text-xs">Late Days</p><p className="font-medium text-navy">{salary.lateDays}</p></div>
            <div><p className="text-gray-400 text-xs">Late Deduction</p><p className="font-medium text-navy">PKR {Number(salary.lateDeduction).toLocaleString()}</p></div>
            <div><p className="text-gray-400 text-xs">Earned Salary</p><p className="font-medium text-navy">PKR {Number(salary.earnedSalary).toLocaleString()}</p></div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Net Salary</span>
            <span className="text-xl font-bold text-orange">PKR {Number(salary.netSalary).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveTab({ userId, toast }) {
  const [requests, setRequests] = useState([]);
  const [balance, setBalance] = useState({ casual: 0, sick: 0, annual: 0 });
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/hrm/leave/${userId}`);
      setRequests(res.data.data.requests || []);
      setBalance(res.data.data.balance || { casual: 0, sick: 0, annual: 0 });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load leave history.');
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (request, status) => {
    if (!window.confirm(`Mark this leave request as ${status}?`)) return;
    setReviewingId(request.id);
    try {
      await api.patch(`/hrm/leave/${request.id}/review`, { status });
      toast.success(`Leave ${status}.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update leave request.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-navy">{balance.casual}</p>
          <p className="text-sm text-gray-500 mt-0.5">Casual Leave Left</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-navy">{balance.sick}</p>
          <p className="text-sm text-gray-500 mt-0.5">Sick Leave Left</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-2xl font-bold text-navy">{balance.annual}</p>
          <p className="text-sm text-gray-500 mt-0.5">Annual Leave Left</p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {requests.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No leave requests" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Type</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">From</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">To</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Days</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5 text-navy font-medium capitalize">{r.leave_type}</td>
                    <td className="px-6 py-3.5 text-gray-600">{r.from_date}</td>
                    <td className="px-6 py-3.5 text-gray-600">{r.to_date}</td>
                    <td className="px-6 py-3.5 text-gray-600">{r.total_days}</td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                        r.status === 'approved' ? 'bg-green-100 text-green-800' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {r.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            className="text-xs px-2.5 py-1.5"
                            onClick={() => handleReview(r, 'approved')}
                            disabled={reviewingId === r.id}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            className="text-xs px-2.5 py-1.5"
                            onClick={() => handleReview(r, 'rejected')}
                            disabled={reviewingId === r.id}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
