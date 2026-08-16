import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Briefcase, Clock, DollarSign, CalendarCheck, Download, UserPlus,
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, PlaneTakeoff,
  Contact, MapPin, Wallet, Palmtree, Stethoscope, Plus, PlayCircle, Users
} from 'lucide-react';
import api from '../services/api';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const TABS = [
  { key: 'attendance', label: 'Attendance', icon: Clock },
  { key: 'salary', label: 'Salary', icon: DollarSign },
  { key: 'leave', label: 'Leave', icon: CalendarCheck },
  { key: 'employees', label: 'Employees', icon: Contact }
];

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Employee directory record — plain HR contact info, no login account.
// Kept separate from the "Employee" selector above/salesmen (which are
// real accounts used for attendance check-in via the mobile app).
const EMPTY_EMPLOYEE_FORM = { full_name: '', phone: '', email: '', address: '', city: '', salary: '' };

const now = new Date();
const pad2 = (n) => String(n).padStart(2, '0');

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

export default function HRM() {
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [tab, setTab] = useState('attendance');

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(EMPTY_EMPLOYEE_FORM);
  const [savingEmployee, setSavingEmployee] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);

  useEffect(() => {
    loadStaff();
    loadEmployees();
  }, []);

  const loadStaff = async () => {
    try {
      const res = await api.get('/salesmen');
      setStaff(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load staff list.');
    }
  };

  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const res = await api.get('/employees');
      setEmployees(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load employee directory.');
    } finally {
      setEmployeesLoading(false);
    }
  };

  // Steps month/year forward or back, rolling over the year at Jan/Dec —
  // shared by the top filter bar and the attendance calendar's chevrons.
  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!employeeForm.full_name) {
      toast.error('Full name is required.');
      return;
    }
    setSavingEmployee(true);
    try {
      await api.post('/employees', {
        ...employeeForm,
        salary: employeeForm.salary === '' ? null : Number(employeeForm.salary)
      });
      toast.success('Employee added.');
      setShowAddEmployee(false);
      setEmployeeForm(EMPTY_EMPLOYEE_FORM);
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add employee.');
    } finally {
      setSavingEmployee(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-end mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">HRM</h1>
          <p className="text-sm text-gray-500 mt-1">Attendance, salary and leave management for field staff</p>
        </div>
        <Button
          variant="accent"
          onClick={() => { setEmployeeForm(EMPTY_EMPLOYEE_FORM); setShowAddEmployee(true); }}
          className="flex items-center gap-2"
        >
          <UserPlus size={16} /> Add Employee
        </Button>
      </div>

      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="min-w-[220px]">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
          >
            <option value="">— Select an employee —</option>
            {staff.length > 0 && (
              <optgroup label="Salesmen (app login)">
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.phone})</option>
                ))}
              </optgroup>
            )}
            {employees.length > 0 && (
              <optgroup label="Employees (directory — manual only)">
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}{emp.phone ? ` (${emp.phone})` : ''}</option>
                ))}
              </optgroup>
            )}
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

      {tab === 'employees' ? (
        <EmployeesTab employees={employees} loading={employeesLoading} />
      ) : tab === 'leave' ? (
        <LeaveTab staff={staff} employees={employees} toast={toast} />
      ) : tab === 'salary' ? (
        <PayrollTab month={month} year={year} toast={toast} />
      ) : !userId ? (
        <div className="bg-white rounded-2xl shadow-card border border-gray-100">
          <EmptyState icon={Briefcase} title="Select an employee" subtitle="Choose an employee above to manage their records" />
        </div>
      ) : (
        <AttendanceTab userId={userId} month={month} year={year} stepMonth={stepMonth} toast={toast} />
      )}

      {showAddEmployee && (
        <Modal title="Add Employee" onClose={() => setShowAddEmployee(false)}>
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={employeeForm.full_name}
                onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input
                type="text"
                value={employeeForm.phone}
                onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
              <input
                type="text"
                value={employeeForm.address}
                onChange={(e) => setEmployeeForm({ ...employeeForm, address: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                <input
                  type="text"
                  value={employeeForm.city}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, city: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Salary (PKR)</label>
                <input
                  type="number"
                  min="0"
                  value={employeeForm.salary}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              This just saves a contact record — no login account is created. Field staff who need the mobile app (attendance, GPS, orders) should instead be added from Salesmen → Add Salesman.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddEmployee(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={savingEmployee}>
                {savingEmployee ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Plain HR contact directory — separate from the attendance/salary/leave
// system above, which needs a real salesman login account. These rows
// live in their own `employees` table with no auth.users row at all.
function EmployeesTab({ employees, loading }) {
  if (loading) return <SkeletonTable rows={5} cols={5} />;

  if (employees.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-card border border-gray-100">
        <EmptyState icon={Contact} title="No employees on file yet" subtitle="Use the Add Employee button above to add one" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Email</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">City</th>
              <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Salary</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => (
              <tr key={emp.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                <td className="px-6 py-3.5">
                  <div className="font-medium text-navy">{emp.full_name}</div>
                  {emp.address && (
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {emp.address}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3.5 text-gray-600">{emp.phone || '—'}</td>
                <td className="px-6 py-3.5 text-gray-600">{emp.email || '—'}</td>
                <td className="px-6 py-3.5 text-gray-600">{emp.city || '—'}</td>
                <td className="px-6 py-3.5 text-right font-medium text-navy">
                  {emp.salary != null ? (
                    <span className="inline-flex items-center gap-1 justify-end">
                      <Wallet size={13} className="text-gray-400" /> PKR {Number(emp.salary).toLocaleString()}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Builds a Monday-first calendar grid for the given month, padded with
// faded leading/trailing days from the neighboring months so every row
// has 7 cells.
function buildCalendarDays(month, year) {
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
  const leading = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday

  const cells = [];
  for (let i = leading - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, dateStr: `${year}-${pad2(month)}-${pad2(d)}` });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, inMonth: false, dateStr: null });
  }
  return cells;
}

const STATUS_STYLE = {
  present: { cell: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100', dot: 'bg-emerald-500' },
  late: { cell: 'bg-orange/10 border-orange/30 hover:bg-orange/20', dot: 'bg-orange' },
  absent: { cell: 'bg-red-50 border-red-200 hover:bg-red-100', dot: 'bg-red-500' },
  leave: { cell: 'bg-navy-chip/60 border-navy-chip hover:bg-navy-chip', dot: 'bg-navy-container' }
};

function AttendanceTab({ userId, month, year, stepMonth, toast }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markForm, setMarkForm] = useState({ date: '', status: 'present', notes: '' });
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/hrm/attendance/${userId}`, { params: { month, year } });
      setRecords(res.data.data.records || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [userId, month, year]);

  useEffect(() => { load(); }, [load]);

  const recordsByDate = useMemo(() => {
    const map = {};
    records.forEach((r) => { map[r.date] = r; });
    return map;
  }, [records]);

  const summary = useMemo(() => ({
    present: records.filter((r) => r.status === 'present').length,
    absent: records.filter((r) => r.status === 'absent').length,
    late: records.filter((r) => r.is_late).length,
    leave: records.filter((r) => r.status === 'leave').length
  }), [records]);

  const calendarDays = useMemo(() => buildCalendarDays(month, year), [month, year]);
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const openMarkModal = (dateStr) => {
    setMarkForm({ date: dateStr || '', status: 'present', notes: '' });
    setShowMarkModal(true);
  };

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
      setShowMarkModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark attendance.');
    } finally {
      setMarking(false);
    }
  };

  const STATS = [
    { key: 'present', label: 'Present', value: summary.present, icon: CheckCircle2, iconWrap: 'bg-emerald-50 text-emerald-600' },
    { key: 'absent', label: 'Absent', value: summary.absent, icon: XCircle, iconWrap: 'bg-red-50 text-red-600' },
    { key: 'late', label: 'Late', value: summary.late, icon: Clock, iconWrap: 'bg-orange/10 text-orange' },
    { key: 'leave', label: 'Leaves', value: summary.leave, icon: PlaneTakeoff, iconWrap: 'bg-navy-chip text-navy' }
  ];

  return (
    <div>
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Summary stat cards */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="bg-white rounded-2xl shadow-card border border-gray-100 p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconWrap}`}>
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{s.label}</p>
                  <p className="text-2xl font-bold text-navy leading-tight">{s.value}</p>
                </div>
              </div>
            );
          })}
          <Button variant="accent" onClick={() => openMarkModal('')} className="flex items-center justify-center gap-2 mt-1">
            <CheckCircle2 size={16} /> Mark Attendance
          </Button>
        </div>

        {/* Calendar */}
        <div className="lg:col-span-9 bg-white rounded-2xl shadow-card border border-gray-100 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-semibold text-navy text-base">{MONTH_NAMES[month - 1]} {year}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => stepMonth(-1)}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-navy transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => stepMonth(1)}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-navy transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((cell, i) => {
                  if (!cell.inMonth) {
                    return (
                      <div key={i} className="aspect-square rounded-xl border border-gray-100 flex items-center justify-center text-sm text-gray-300">
                        {cell.day}
                      </div>
                    );
                  }
                  const record = recordsByDate[cell.dateStr];
                  const status = record ? (record.is_late ? 'late' : record.status) : null;
                  const style = status ? STATUS_STYLE[status] : null;
                  const isToday = cell.dateStr === todayStr;
                  return (
                    <button
                      key={i}
                      onClick={() => openMarkModal(cell.dateStr)}
                      title={record ? `${record.status}${record.is_late ? ' (late)' : ''}` : 'No record — click to mark'}
                      className={`aspect-square rounded-xl border flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                        style ? style.cell : 'border-gray-100 hover:bg-gray-50'
                      } ${isToday ? 'ring-2 ring-navy ring-offset-1' : ''}`}
                    >
                      <span className={`text-sm font-semibold z-10 ${isToday ? 'text-navy' : 'text-gray-700'}`}>{cell.day}</span>
                      {style && <span className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${style.dot}`} />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-4 justify-center">
                {Object.entries(STATUS_STYLE).map(([key, style]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    <span className="text-xs text-gray-500 capitalize">{key}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detailed record list — supplements the calendar with check-in/out times */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mt-5">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-semibold text-navy text-sm">Attendance Records</h3>
        </div>
        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : records.length === 0 ? (
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
                      r.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                      r.status === 'absent' ? 'bg-red-50 text-red-700' : 'bg-navy-chip text-navy'
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

      {showMarkModal && (
        <Modal title="Mark Attendance" onClose={() => setShowMarkModal(false)}>
          <form onSubmit={handleMark} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
              <input
                type="date"
                required
                value={markForm.date}
                onChange={(e) => setMarkForm({ ...markForm, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status *</label>
              <select
                value={markForm.status}
                onChange={(e) => setMarkForm({ ...markForm, status: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <input
                type="text"
                value={markForm.notes}
                onChange={(e) => setMarkForm({ ...markForm, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowMarkModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={marking}>
                {marking ? 'Saving...' : 'Mark'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const EMPTY_STRUCTURE_FORM = { basic_salary: '', allowances: '', deductions: '', working_days: 26 };

// Company-wide Payroll Register — every salesman + directory employee's
// calculated salary for one month at once. Backed by GET /hrm/payroll,
// which reuses the exact same net-salary math as the old per-employee
// view (attendance-based earned salary minus late deduction minus fixed
// deductions), just run for the whole roster in one call.
function PayrollTab({ month, year, toast }) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ totalEmployees: 0, totalPayroll: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);

  const [showSetup, setShowSetup] = useState(false);
  const [setupTarget, setSetupTarget] = useState(null);
  const [structureForm, setStructureForm] = useState(EMPTY_STRUCTURE_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/hrm/payroll', { params: { month, year } });
      setRows(res.data.data.rows || []);
      setSummary({
        totalEmployees: res.data.data.totalEmployees || 0,
        totalPayroll: res.data.data.totalPayroll || 0,
        pendingCount: res.data.data.pendingCount || 0
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load payroll.');
    } finally {
      setLoading(false);
    }
  }, [month, year, toast]);

  useEffect(() => { load(); }, [load]);

  const openSetup = (row) => {
    setSetupTarget(row);
    setStructureForm(EMPTY_STRUCTURE_FORM);
    setShowSetup(true);
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!structureForm.basic_salary) {
      toast.error('Basic salary is required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/hrm/salary/setup', { user_id: setupTarget.user_id, ...structureForm });
      toast.success('Salary structure saved.');
      setShowSetup(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save salary structure.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPayslip = async (row) => {
    setDownloadingId(row.user_id);
    try {
      const res = await api.get(`/hrm/payslip/${row.user_id}`, { params: { month, year }, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `payslip-${row.full_name.replace(/\s+/g, '-')}-${month}-${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download payslip.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-3 bg-gray-50/50">
          <h3 className="font-semibold text-navy flex items-center gap-2">
            <span className="bg-navy-chip text-navy p-1.5 rounded-lg flex items-center justify-center"><Users size={15} /></span>
            Payroll Register — {MONTH_NAMES[month - 1]} {year}
          </h3>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 bg-orange hover:bg-orange/90 disabled:opacity-60 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <PlayCircle size={15} /> {loading ? 'Running...' : 'Run Payroll'}
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={DollarSign} title="No staff on file yet" subtitle="Add salesmen or employees to run payroll" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide">Employee</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Basic</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Allowances</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Deductions</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Net Pay</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-center">Status</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.user_id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-colors ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-navy-chip text-navy flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                          {getInitials(row.full_name)}
                        </div>
                        <div>
                          <div className="font-medium text-navy">{row.full_name}</div>
                          <div className="text-xs text-gray-400">{row.position}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right text-gray-600">
                      {row.status === 'calculated' ? `PKR ${Number(row.basic_salary).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right text-emerald-600">
                      {row.status === 'calculated' ? Number(row.allowances).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right text-red-600">
                      {row.status === 'calculated' ? Number(row.deductions).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right font-bold text-navy">
                      {row.status === 'calculated' ? `PKR ${Number(row.netSalary).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        row.status === 'calculated' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange/10 text-orange'
                      }`}>
                        {row.status === 'calculated' ? 'Calculated' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {row.status === 'calculated' ? (
                        <button
                          onClick={() => handleDownloadPayslip(row)}
                          disabled={downloadingId === row.user_id}
                          className="text-navy hover:bg-navy-chip/40 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title="Download Payslip"
                        >
                          <Download size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => openSetup(row)}
                          className="text-xs text-navy hover:underline font-medium"
                        >
                          Set Up
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-navy-chip text-navy flex items-center justify-center flex-shrink-0"><Users size={22} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Employees</p>
            <p className="text-2xl font-bold text-navy leading-tight">{summary.totalEmployees}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><Wallet size={22} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Payroll</p>
            <p className="text-2xl font-bold text-navy leading-tight">PKR {summary.totalPayroll.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange/10 text-orange flex items-center justify-center flex-shrink-0"><DollarSign size={22} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pending Processing</p>
            <p className="text-2xl font-bold text-navy leading-tight">{summary.pendingCount}</p>
          </div>
        </div>
      </div>

      {showSetup && (
        <Modal title={`Set Up Salary — ${setupTarget?.full_name}`} onClose={() => setShowSetup(false)}>
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Basic Salary *</label>
                <input
                  type="number" min="0" required
                  value={structureForm.basic_salary}
                  onChange={(e) => setStructureForm({ ...structureForm, basic_salary: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Allowances</label>
                <input
                  type="number" min="0"
                  value={structureForm.allowances}
                  onChange={(e) => setStructureForm({ ...structureForm, allowances: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Deductions</label>
                <input
                  type="number" min="0"
                  value={structureForm.deductions}
                  onChange={(e) => setStructureForm({ ...structureForm, deductions: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Working Days</label>
                <input
                  type="number" min="1"
                  value={structureForm.working_days}
                  onChange={(e) => setStructureForm({ ...structureForm, working_days: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Net pay is calculated from this month's attendance: present days are paid, late days lose half a day's pay.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowSetup(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const LEAVE_TYPE_META = {
  casual: { label: 'Casual Leave', icon: Palmtree },
  sick: { label: 'Sick Leave', icon: Stethoscope },
  annual: { label: 'Annual Leave', icon: PlaneTakeoff }
};

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' }
];

const STATUS_BADGE = {
  pending: 'bg-orange/10 text-orange',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700'
};

const STATUS_BORDER = {
  pending: 'border-orange',
  approved: 'border-emerald-500',
  rejected: 'border-red-500'
};

function formatShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EMPTY_LEAVE_FORM = { user_id: '', leave_type: 'casual', from_date: '', to_date: '', reason: '' };

// Company-wide leave board — every staff member's requests at once
// (salesmen + directory employees), not scoped to one selected employee.
// Backed by GET /hrm/leave (see hrm.controller.js's getAllLeaveRequests).
function LeaveTab({ staff, employees, toast }) {
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewingId, setReviewingId] = useState(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_LEAVE_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/hrm/leave');
      setRequests(res.data.data.requests || []);
      setBalances(res.data.data.balances || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    all: requests.length
  }), [requests]);

  const visibleRequests = statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter);
  const balanceByUser = useMemo(() => {
    const map = {};
    balances.forEach((b) => { map[b.user_id] = b; });
    return map;
  }, [balances]);

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

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newForm.user_id || !newForm.from_date || !newForm.to_date) {
      toast.error('Employee, start date and end date are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/hrm/leave/manual', newForm);
      toast.success('Leave request added.');
      setShowNewModal(false);
      setNewForm(EMPTY_LEAVE_FORM);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add leave request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === f.key ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {f.label}
              {f.key === 'pending' && counts.pending > 0 && (
                <span className="bg-orange text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{counts.pending}</span>
              )}
            </button>
          ))}
        </div>
        <Button
          variant="accent"
          onClick={() => { setNewForm(EMPTY_LEAVE_FORM); setShowNewModal(true); }}
          className="flex items-center gap-2"
        >
          <Plus size={16} /> New Leave Request
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Requests */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {loading ? (
            <SkeletonTable rows={4} cols={4} />
          ) : visibleRequests.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card border border-gray-100">
              <EmptyState icon={CalendarCheck} title="No leave requests" subtitle={`Nothing in "${STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}" right now`} />
            </div>
          ) : (
            visibleRequests.map((r) => {
              const meta = LEAVE_TYPE_META[r.leave_type] || LEAVE_TYPE_META.casual;
              const TypeIcon = meta.icon;
              const bal = balanceByUser[r.user_id];
              const cap = r.leave_type === 'annual' ? 14 : 10;
              return (
                <div
                  key={r.id}
                  className={`bg-white rounded-2xl shadow-card border-l-4 p-5 ${STATUS_BORDER[r.status] || 'border-gray-200'} ${
                    r.status !== 'pending' ? 'opacity-80' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-navy-chip text-navy flex items-center justify-center font-bold flex-shrink-0">
                        {getInitials(r.requester.full_name)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-navy">{r.requester.full_name}</h3>
                        <p className="text-xs text-gray-400">{r.requester.position}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                      {r.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Leave Type</p>
                      <p className="font-medium text-navy flex items-center gap-1.5 text-sm">
                        <TypeIcon size={15} className="text-navy-container" /> {meta.label}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Duration</p>
                      <p className="font-medium text-navy text-sm">
                        {formatShortDate(r.from_date)} – {formatShortDate(r.to_date)}{' '}
                        <span className="text-gray-400 font-normal">({r.total_days} day{r.total_days > 1 ? 's' : ''})</span>
                      </p>
                    </div>
                    {r.reason && (
                      <div className="col-span-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Reason</p>
                        <p className="text-sm text-gray-700">{r.reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center flex-wrap gap-3 pt-3 border-t border-gray-100">
                    {bal && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-400">{meta.label.split(' ')[0]} Balance:</span>
                        <span className="font-medium text-navy px-2 py-1 bg-navy-chip/50 rounded-md text-xs">
                          {bal[r.leave_type]}/{cap} Remaining
                        </span>
                      </div>
                    )}
                    {r.status === 'pending' && (
                      <div className="flex gap-2 ml-auto">
                        <button
                          onClick={() => handleReview(r, 'rejected')}
                          disabled={reviewingId === r.id}
                          className="px-3.5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleReview(r, 'approved')}
                          disabled={reviewingId === r.id}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          {reviewingId === r.id ? 'Saving...' : 'Approve Request'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Balance summary */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 lg:sticky lg:top-6">
            <h3 className="font-semibold text-navy mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-navy" /> Leave Balance Summary
            </h3>
            {balances.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No staff on file yet</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 px-1 font-semibold text-[11px] uppercase tracking-wide text-gray-400">Employee</th>
                      <th className="pb-2 px-1 font-semibold text-[11px] uppercase tracking-wide text-gray-400 text-right">Casual</th>
                      <th className="pb-2 px-1 font-semibold text-[11px] uppercase tracking-wide text-gray-400 text-right">Sick</th>
                      <th className="pb-2 px-1 font-semibold text-[11px] uppercase tracking-wide text-gray-400 text-right">Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.user_id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 px-1">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-navy-chip text-navy flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {getInitials(b.full_name)}
                            </div>
                            <span className="font-medium text-navy truncate max-w-[90px]">{b.full_name}</span>
                          </div>
                        </td>
                        <td className={`py-2.5 px-1 text-right ${b.casual === 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          <span className="text-navy font-medium">{b.casual}</span>/10
                        </td>
                        <td className={`py-2.5 px-1 text-right ${b.sick === 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          <span className="text-navy font-medium">{b.sick}</span>/10
                        </td>
                        <td className={`py-2.5 px-1 text-right ${b.annual === 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          <span className="text-navy font-medium">{b.annual}</span>/14
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewModal && (
        <Modal title="New Leave Request" onClose={() => setShowNewModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Employee *</label>
              <select
                required
                value={newForm.user_id}
                onChange={(e) => setNewForm({ ...newForm, user_id: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="">— Select —</option>
                {staff.length > 0 && (
                  <optgroup label="Salesmen">
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </optgroup>
                )}
                {employees.length > 0 && (
                  <optgroup label="Employees">
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Leave Type *</label>
              <select
                value={newForm.leave_type}
                onChange={(e) => setNewForm({ ...newForm, leave_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow bg-white"
              >
                <option value="casual">Casual Leave</option>
                <option value="sick">Sick Leave</option>
                <option value="annual">Annual Leave</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">From *</label>
                <input
                  type="date" required
                  value={newForm.from_date}
                  onChange={(e) => setNewForm({ ...newForm, from_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">To *</label>
                <input
                  type="date" required
                  value={newForm.to_date}
                  onChange={(e) => setNewForm({ ...newForm, to_date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason</label>
              <textarea
                rows={3}
                value={newForm.reason}
                onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-shadow"
              />
            </div>
            <p className="text-xs text-gray-400">
              Added as a pending request — approve or reject it from the board like any other.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowNewModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="accent" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
