const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { generatePayslip } = require('../services/payslip.service');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { withRetry } = require('../utils/withRetry');

// ═══════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════

// Pakistan (Asia/Karachi) wall-clock helpers — the server's own clock is UTC.
const pktTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' });
const pktClock = (d) => {
  const [hour, minute] = d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }).split(':').map(Number);
  return { hour: hour % 24, minute };
};

// POST /api/v1/hrm/attendance/checkin — routed through the pgrestGet/
// pgrestPost/pgrestPatch raw-https bypass (see utils/directQuery.js),
// not plain supabase-js — this endpoint was 500ing for salesmen on
// Railway, the same documented silent-failure class every other
// self-service write in this codebase already had to route around.
// No native upsert over that bypass, so this does the
// check-then-insert-or-update by hand instead of a single .upsert().
const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const existingRows = await withRetry(() => pgrestGet('attendance', {
      select: 'id,check_in',
      user_id: `eq.${req.user.id}`,
      date: `eq.${today}`,
    }));
    const existing = existingRows?.[0];

    if (existing?.check_in)
      return error(res, 'Already checked in today', 400);

    // Check if late (after 9:00 AM)
    // The server runs on UTC — "9:00 AM" and the time shown to the admin
    // are both Pakistan time.
    const now    = new Date();
    const pkt    = pktClock(now);
    const isLate = pkt.hour * 60 + pkt.minute > 9 * 60;

    const body = {
      company_id:    req.user.company_id,
      user_id:       req.user.id,
      date:          today,
      check_in:      new Date().toISOString(),
      check_in_lat:  latitude  || null,
      check_in_lng:  longitude || null,
      status:        'present',
      is_late:       isLate,
    };

    const rows = existing?.id
      ? await pgrestPatch('attendance', { id: `eq.${existing.id}` }, body)
      : await pgrestPost('attendance', body);
    const data = rows?.[0];

    // Best-effort — admin sees who checked in/out and exactly when,
    // without having to open the HRM page and look it up.
    try {
      await pgrestPost('notifications', {
        company_id:     req.user.company_id,
        recipient_role: 'branch_admin',
        title:          isLate ? 'Late Check-In' : 'Check-In',
        body:           `${req.user.full_name || 'An employee'} checked in${isLate ? ' late' : ''} at ${pktTime(now)}.`,
        type:           'attendance',
      });
    } catch (e) { /* non-fatal */ }

    return success(res, data, isLate ? 'Checked in (Late)' : 'Checked in successfully');
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/hrm/attendance/checkout
const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const rows = await pgrestPatch('attendance', {
      user_id: `eq.${req.user.id}`,
      date: `eq.${today}`,
    }, {
      check_out:     new Date().toISOString(),
      check_out_lat: latitude  || null,
      check_out_lng: longitude || null,
    });
    const data = rows?.[0];
    if (!data) return error(res, 'No check-in found for today', 400);

    try {
      await pgrestPost('notifications', {
        company_id:     req.user.company_id,
        recipient_role: 'branch_admin',
        title:          'Check-Out',
        body:           `${req.user.full_name || 'An employee'} checked out at ${pktTime(new Date())}.`,
        type:           'attendance',
      });
    } catch (e) { /* non-fatal */ }

    return success(res, data, 'Checked out successfully');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/attendance/:userId
const getAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const now   = new Date();
    const m     = month || now.getMonth() + 1;
    const y     = year  || now.getFullYear();
    const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
    const end   = new Date(y, m, 0).toISOString().split('T')[0];

    // Two conditions on the same column (date between start/end) need
    // repeated query params PostgREST-side — the plain pgrestGet helper
    // can only carry one value per key, so this goes through
    // pgrestGetRaw with a hand-built query string instead (same pattern
    // bank.controller.js's getBankTransactions already uses).
    const data = await withRetry(() => pgrestGetRaw(
      `attendance?select=*&user_id=eq.${userId}&date=gte.${start}&date=lte.${end}&order=date.asc`
    ));

    const presentDays = data?.filter(a => a.status === 'present').length || 0;
    const lateDays    = data?.filter(a => a.is_late).length || 0;
    const absentDays  = data?.filter(a => a.status === 'absent').length || 0;

    return success(res, { records: data, summary: { presentDays, lateDays, absentDays } });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/attendance-log?from=YYYY-MM-DD&to=YYYY-MM-DD&role=all|salesman|driver
// Check-in history of the field staff who log in to the app (salesmen and
// drivers): for every day in the range and every approved, active staff
// member, either the time they checked in / out or "not checked in".
// Admin only; a branch admin sees their own branch, a super admin the
// branch picked in the city filter (or all).
const PKT = 'Asia/Karachi';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LOG_DAYS = 93;
const pktDateStr = (d) => d.toLocaleDateString('en-CA', { timeZone: PKT });

const getAttendanceLog = async (req, res) => {
  try {
    const today = pktDateStr(new Date());
    let from = String(req.query.from || today).slice(0, 10);
    let to = String(req.query.to || from).slice(0, 10);
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return error(res, 'from and to must be dates like 2026-10-19', 400);
    if (from > to) [from, to] = [to, from];
    if (to > today) to = today; // nothing to report for days that haven't happened
    if (from > to) from = to;

    const dayMs = 86400000;
    const days = Math.round((Date.parse(to) - Date.parse(from)) / dayMs) + 1;
    if (days > MAX_LOG_DAYS) return error(res, `Pick a range of at most ${MAX_LOG_DAYS} days.`, 400);

    const role = ['salesman', 'driver'].includes(req.query.role) ? req.query.role : 'all';
    const companyId = resolveCompanyId(req);
    const cf = companyId ? { company_id: `eq.${companyId}` } : {};

    const [salesmen, drivers, companies] = await Promise.all([
      role === 'driver' ? [] : pgrestGet('salesmen', { select: 'id,full_name,phone,company_id', is_active: 'eq.true', is_approved: 'eq.true', ...cf }),
      role === 'salesman' ? [] : pgrestGet('drivers', { select: 'id,full_name,phone,car_number,company_id', is_active: 'eq.true', is_approved: 'eq.true', ...cf }),
      pgrestGet('companies', { select: 'id,city' }),
    ]);
    const cityOf = Object.fromEntries((companies || []).map((c) => [c.id, c.city]));
    const staff = [
      ...(salesmen || []).map((s) => ({ ...s, role: 'salesman' })),
      ...(drivers || []).map((d) => ({ ...d, role: 'driver' })),
    ].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

    const dates = [];
    for (let i = 0; i < days; i++) dates.push(new Date(Date.parse(to) - i * dayMs).toISOString().slice(0, 10)); // newest first

    let records = [];
    if (staff.length) {
      records = await withRetry(() => pgrestGetRaw(
        `attendance?select=*&user_id=in.(${staff.map((s) => s.id).join(',')})&date=gte.${from}&date=lte.${to}&limit=10000`
      )) || [];
    }
    const byKey = Object.fromEntries(records.map((r) => [`${r.user_id}|${r.date}`, r]));

    const rows = [];
    for (const date of dates) {
      for (const s of staff) {
        const rec = byKey[`${s.id}|${date}`];
        let state = 'not_checked_in';
        if (rec?.check_in) state = 'checked_in';
        else if (rec) state = rec.status === 'present' ? 'marked_present' : (rec.status || 'not_checked_in');

        // Recomputed from the real check-in time (Pakistan time, after 9:00 AM)
        // — the flag stored on older rows was worked out in the server's UTC
        // clock and is unreliable.
        let isLate = false;
        if (rec?.check_in) {
          const c = pktClock(new Date(rec.check_in));
          isLate = c.hour * 60 + c.minute > 9 * 60;
        }
        rows.push({
          date,
          user_id: s.id,
          name: s.full_name,
          phone: s.phone,
          role: s.role,
          car_number: s.car_number || null,
          city: cityOf[s.company_id] || null,
          state,
          check_in: rec?.check_in || null,
          check_out: rec?.check_out || null,
          is_late: isLate,
          check_in_lat: rec?.check_in_lat ?? null,
          check_in_lng: rec?.check_in_lng ?? null,
          check_out_lat: rec?.check_out_lat ?? null,
          check_out_lng: rec?.check_out_lng ?? null,
          notes: rec?.notes || null,
        });
      }
    }

    const summary = {
      staff: staff.length,
      days,
      checkedIn: rows.filter((r) => r.state === 'checked_in').length,
      late: rows.filter((r) => r.is_late).length,
      notCheckedIn: rows.filter((r) => r.state === 'not_checked_in').length,
    };
    return success(res, { from, to, summary, rows });
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/hrm/attendance/manual — admin marks attendance
const manualAttendance = async (req, res) => {
  try {
    const { user_id, date, status, notes } = req.body;
    if (!user_id || !date || !status)
      return error(res, 'user_id, date, status are required', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('attendance')
      .upsert({
        company_id: req.user.company_id,
        user_id, date, status, notes
      }, { onConflict: 'user_id,date' })
      .select().single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Attendance marked');
  } catch (err) { return error(res, err.message); }
};

// ═══════════════════════════════════════
// SALARY
// ═══════════════════════════════════════

// POST /api/v1/hrm/salary/setup
const setupSalary = async (req, res) => {
  try {
    const { user_id, basic_salary, allowances, deductions, working_days } = req.body;
    if (!user_id || !basic_salary)
      return error(res, 'user_id and basic_salary are required', 400);

    // Deactivate old structure
    await supabaseAdmin
      .from('salary_structures')
      .update({ is_active: false })
      .eq('user_id', user_id)
      .eq('is_active', true);

    const { data, error: dbErr } = await supabaseAdmin
      .from('salary_structures')
      .insert({
        company_id:    req.user.company_id,
        user_id,
        basic_salary:  Number(basic_salary),
        allowances:    Number(allowances  || 0),
        deductions:    Number(deductions  || 0),
        working_days:  Number(working_days || 26),
        effective_from: new Date().toISOString().split('T')[0]
      })
      .select().single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Salary structure saved', 201);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/salary/:userId
// Calculate net salary based on attendance
const getSalary = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const now   = new Date();
    const m     = month || now.getMonth() + 1;
    const y     = year  || now.getFullYear();
    const start = new Date(y, m-1, 1).toISOString().split('T')[0];
    const end   = new Date(y, m, 0).toISOString().split('T')[0];

    // Get salary structure
    const { data: structure } = await supabaseAdmin
      .from('salary_structures')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!structure) return error(res, 'No salary structure found for this employee', 404);

    // Get attendance for month
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status, is_late')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end);

    const presentDays = attendance?.filter(a => a.status === 'present').length || 0;
    const lateDays    = attendance?.filter(a => a.is_late).length || 0;

    // Salary calculation
    const perDaySalary = (structure.basic_salary + structure.allowances) / structure.working_days;
    const earnedSalary = perDaySalary * presentDays;
    const lateDeduction = (perDaySalary / 2) * lateDays;
    const netSalary    = earnedSalary - lateDeduction - structure.deductions;

    return success(res, {
      period:         `${m}/${y}`,
      structure,
      presentDays,
      lateDays,
      earnedSalary:   Math.round(earnedSalary),
      lateDeduction:  Math.round(lateDeduction),
      netSalary:      Math.round(netSalary),
    });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/payroll — every staff member's calculated salary for one
// month at once (salesmen + directory employees), for the admin's company-
// wide Payroll Register. Same math as getSalary above, just run for
// everyone instead of one userId. Anyone without a salary structure set up
// yet comes back with status "pending" rather than being left out.
const getPayroll = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
    const end = new Date(y, m, 0).toISOString().split('T')[0];
    // Explicit ?company_id lets super_admin view another branch's payroll
    // (CityFilter sends one real ID per branch when "All Cities" is
    // selected and combines results client-side); falls back to the
    // requester's own branch otherwise, same as before.
    const companyId = resolveCompanyId(req) || req.user.company_id;

    const [salesmenRes, employeesRes, structuresRes] = await Promise.all([
      supabaseAdmin.from('salesmen').select('id, full_name, position').eq('company_id', companyId).eq('is_active', true),
      supabaseAdmin.from('employees').select('id, full_name').eq('company_id', companyId).eq('is_active', true),
      supabaseAdmin.from('salary_structures').select('*').eq('company_id', companyId).eq('is_active', true)
    ]);

    const structureByUser = {};
    (structuresRes.data || []).forEach((s) => { structureByUser[s.user_id] = s; });

    const people = [
      ...(salesmenRes.data || []).map((s) => ({ id: s.id, full_name: s.full_name, position: s.position || 'Salesman' })),
      ...(employeesRes.data || []).map((e) => ({ id: e.id, full_name: e.full_name, position: 'Employee' }))
    ];

    const rows = await Promise.all(people.map(async (person) => {
      const structure = structureByUser[person.id];
      if (!structure) {
        return { user_id: person.id, full_name: person.full_name, position: person.position, status: 'pending' };
      }

      const { data: attendance } = await supabaseAdmin
        .from('attendance')
        .select('status, is_late')
        .eq('user_id', person.id)
        .gte('date', start)
        .lte('date', end);

      const presentDays = attendance?.filter((a) => a.status === 'present').length || 0;
      const lateDays = attendance?.filter((a) => a.is_late).length || 0;
      const perDaySalary = (structure.basic_salary + structure.allowances) / structure.working_days;
      const earnedSalary = perDaySalary * presentDays;
      const lateDeduction = (perDaySalary / 2) * lateDays;
      const netSalary = earnedSalary - lateDeduction - structure.deductions;

      return {
        user_id: person.id,
        full_name: person.full_name,
        position: person.position,
        status: 'calculated',
        basic_salary: structure.basic_salary,
        allowances: structure.allowances,
        deductions: Math.round(lateDeduction + Number(structure.deductions)),
        netSalary: Math.round(netSalary)
      };
    }));

    const totalPayroll = rows.filter((r) => r.status === 'calculated').reduce((s, r) => s + r.netSalary, 0);
    const pendingCount = rows.filter((r) => r.status === 'pending').length;

    return success(res, {
      period: `${m}/${y}`,
      rows,
      totalEmployees: rows.length,
      totalPayroll,
      pendingCount
    });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/payslip/:userId
const downloadPayslip = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const now = new Date();
    const m   = month || now.getMonth() + 1;
    const y   = year  || now.getFullYear();

    // Get employee info — salesmen and directory employees each live in
    // their own table now (see phase6/phase9 migrations), not `users`.
    // Delivery staff are the one role still plainly in `users`, so that's
    // the fallback.
    let employee = null;
    const { data: salesmanRow } = await supabaseAdmin
      .from('salesmen').select('full_name, phone, company_id').eq('id', userId).single();
    if (salesmanRow) {
      employee = { ...salesmanRow, role: 'salesman' };
    } else {
      const { data: employeeRow } = await supabaseAdmin
        .from('employees').select('full_name, phone, company_id').eq('id', userId).single();
      if (employeeRow) {
        employee = { ...employeeRow, role: 'employee' };
      } else {
        const { data: userRow } = await supabaseAdmin
          .from('users').select('full_name, phone, role, company_id').eq('id', userId).single();
        employee = userRow || null;
      }
    }

    // Reuse salary calculation logic
    const start = new Date(y, m-1, 1).toISOString().split('T')[0];
    const end   = new Date(y, m, 0).toISOString().split('T')[0];

    const { data: structure } = await supabaseAdmin
      .from('salary_structures').select('*')
      .eq('user_id', userId).eq('is_active', true).single();

    const { data: attendance } = await supabaseAdmin
      .from('attendance').select('status, is_late')
      .eq('user_id', userId).gte('date', start).lte('date', end);

    const presentDays    = attendance?.filter(a => a.status === 'present').length || 0;
    const lateDays       = attendance?.filter(a => a.is_late).length || 0;
    const perDay         = (structure.basic_salary + structure.allowances) / structure.working_days;
    const earned         = perDay * presentDays;
    const lateDeduction  = (perDay / 2) * lateDays;
    const netSalary      = earned - lateDeduction - structure.deductions;

    const pdfBuffer = await generatePayslip({
      employee, structure, month: m, year: y,
      presentDays, lateDays,
      earnedSalary:  Math.round(earned),
      lateDeduction: Math.round(lateDeduction),
      netSalary:     Math.round(netSalary)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payslip-${userId}-${m}-${y}.pdf`);
    res.send(pdfBuffer);
  } catch (err) { return error(res, err.message); }
};

// ═══════════════════════════════════════
// LEAVE MANAGEMENT
// ═══════════════════════════════════════

// POST /api/v1/hrm/leave/apply
const applyLeave = async (req, res) => {
  try {
    const { leave_type, from_date, to_date, reason } = req.body;
    if (!leave_type || !from_date || !to_date)
      return error(res, 'leave_type, from_date, to_date are required', 400);

    const validTypes = ['casual', 'sick', 'annual'];
    if (!validTypes.includes(leave_type))
      return error(res, 'leave_type must be casual, sick, or annual', 400);

    const from  = new Date(from_date);
    const to    = new Date(to_date);
    const total = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const { data, error: dbErr } = await supabaseAdmin
      .from('leave_requests')
      .insert({
        company_id: req.user.company_id,
        user_id:    req.user.id,
        leave_type, from_date, to_date,
        total_days: total,
        reason: reason || null,
        status: 'pending'
      })
      .select().single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Leave application submitted', 201);
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/hrm/leave/manual — admin submits a leave request on behalf
// of any staff member (salesman OR directory employee). Directory
// employees have no login/JWT, so they can never call POST /leave/apply
// themselves — this is their only path onto the leave board.
const manualLeaveRequest = async (req, res) => {
  try {
    const { user_id, leave_type, from_date, to_date, reason } = req.body;
    if (!user_id || !leave_type || !from_date || !to_date)
      return error(res, 'user_id, leave_type, from_date, to_date are required', 400);

    const validTypes = ['casual', 'sick', 'annual'];
    if (!validTypes.includes(leave_type))
      return error(res, 'leave_type must be casual, sick, or annual', 400);

    const from  = new Date(from_date);
    const to    = new Date(to_date);
    const total = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    const { data, error: dbErr } = await supabaseAdmin
      .from('leave_requests')
      .insert({
        company_id: req.user.company_id,
        user_id, leave_type, from_date, to_date,
        total_days: total,
        reason: reason || null,
        status: 'pending'
      })
      .select().single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Leave request added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/hrm/leave/:id/review
const reviewLeave = async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved','rejected'].includes(status))
      return error(res, 'status must be approved or rejected', 400);

    const { data, error: dbErr } = await supabaseAdmin
      .from('leave_requests')
      .update({ status, admin_note: admin_note || null, reviewed_by: req.user.id })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select().single();

    if (dbErr) throw new Error('Leave request not found');
    return success(res, data, `Leave ${status}`);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/leave/:userId
const getLeaveHistory = async (req, res) => {
  try {
    const { data, error: dbErr } = await supabaseAdmin
      .from('leave_requests')
      .select('*')
      .eq('user_id', req.params.userId)
      .order('created_at', { ascending: false });

    if (dbErr) throw new Error(dbErr.message);

    // Calculate leave balances (10 casual, 10 sick, 14 annual per year)
    const year = new Date().getFullYear();
    const approved = data?.filter(l =>
      l.status === 'approved' &&
      new Date(l.from_date).getFullYear() === year
    ) || [];

    const used = { casual: 0, sick: 0, annual: 0 };
    approved.forEach(l => { used[l.leave_type] += l.total_days; });

    const balance = {
      casual: Math.max(0, 10 - used.casual),
      sick:   Math.max(0, 10 - used.sick),
      annual: Math.max(0, 14 - used.annual),
    };

    return success(res, { requests: data, balance });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/hrm/leave — every leave request across the company, for the
// admin's Leave Management screen (all staff at once, not just one
// selected employee). `leave_requests.user_id` has no DB foreign key (see
// phase6 migration notes — it can point at a salesman OR a directory
// employee), so names are resolved here by checking both tables.
const getAllLeaveRequests = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req) || req.user.company_id;

    const [requestsRes, salesmenRes, employeesRes] = await Promise.all([
      supabaseAdmin
        .from('leave_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('salesmen')
        .select('id, full_name, position')
        .eq('company_id', companyId)
        .eq('is_active', true),
      supabaseAdmin
        .from('employees')
        .select('id, full_name')
        .eq('company_id', companyId)
        .eq('is_active', true)
    ]);

    if (requestsRes.error) throw new Error(requestsRes.error.message);

    const people = new Map();
    (salesmenRes.data || []).forEach(s =>
      people.set(s.id, { full_name: s.full_name, position: s.position || 'Salesman', source: 'salesman' }));
    (employeesRes.data || []).forEach(e =>
      people.set(e.id, { full_name: e.full_name, position: 'Employee', source: 'employee' }));

    const requests = (requestsRes.data || []).map(r => ({
      ...r,
      requester: people.get(r.user_id) || { full_name: 'Unknown', position: '', source: 'unknown' }
    }));

    // Leave balance per person this year — same 10 casual / 10 sick / 14
    // annual allowance as getLeaveHistory, just computed for everyone at
    // once instead of one userId.
    const year = new Date().getFullYear();
    const usedByUser = {};
    (requestsRes.data || []).forEach(r => {
      if (r.status !== 'approved' || new Date(r.from_date).getFullYear() !== year) return;
      usedByUser[r.user_id] = usedByUser[r.user_id] || { casual: 0, sick: 0, annual: 0 };
      usedByUser[r.user_id][r.leave_type] += r.total_days;
    });

    const balances = Array.from(people.entries()).map(([userId, person]) => {
      const used = usedByUser[userId] || { casual: 0, sick: 0, annual: 0 };
      return {
        user_id: userId,
        full_name: person.full_name,
        position: person.position,
        source: person.source,
        casual: Math.max(0, 10 - used.casual),
        sick:   Math.max(0, 10 - used.sick),
        annual: Math.max(0, 14 - used.annual)
      };
    });

    return success(res, { requests, balances });
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  checkIn, checkOut, getAttendance, getAttendanceLog, manualAttendance,
  setupSalary, getSalary, getPayroll, downloadPayslip,
  applyLeave, manualLeaveRequest, reviewLeave, getLeaveHistory, getAllLeaveRequests
};
