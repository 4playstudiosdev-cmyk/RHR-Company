const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { generatePayslip } = require('../services/payslip.service');

// ═══════════════════════════════════════
// ATTENDANCE
// ═══════════════════════════════════════

// POST /api/v1/hrm/attendance/checkin
const checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const today = new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('id, check_in')
      .eq('user_id', req.user.id)
      .eq('date', today)
      .single();

    if (existing?.check_in)
      return error(res, 'Already checked in today', 400);

    // Check if late (after 9:00 AM)
    const now    = new Date();
    const isLate = now.getHours() >= 9 && now.getMinutes() > 0;

    const { data, error: dbErr } = await supabaseAdmin
      .from('attendance')
      .upsert({
        company_id:    req.user.company_id,
        user_id:       req.user.id,
        date:          today,
        check_in:      new Date().toISOString(),
        check_in_lat:  latitude  || null,
        check_in_lng:  longitude || null,
        status:        'present',
        is_late:       isLate
      }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, isLate ? 'Checked in (Late)' : 'Checked in successfully');
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/hrm/attendance/checkout
const checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const { data, error: dbErr } = await supabaseAdmin
      .from('attendance')
      .update({
        check_out:     new Date().toISOString(),
        check_out_lat: latitude  || null,
        check_out_lng: longitude || null,
      })
      .eq('user_id', req.user.id)
      .eq('date', today)
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
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

    const { data, error: dbErr } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true });

    if (dbErr) throw new Error(dbErr.message);

    const presentDays = data?.filter(a => a.status === 'present').length || 0;
    const lateDays    = data?.filter(a => a.is_late).length || 0;
    const absentDays  = data?.filter(a => a.status === 'absent').length || 0;

    return success(res, { records: data, summary: { presentDays, lateDays, absentDays } });
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

// GET /api/v1/hrm/payslip/:userId
const downloadPayslip = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;
    const now = new Date();
    const m   = month || now.getMonth() + 1;
    const y   = year  || now.getFullYear();

    // Get employee info
    const { data: employee } = await supabaseAdmin
      .from('users')
      .select('full_name, phone, role, company_id')
      .eq('id', userId).single();

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

module.exports = {
  checkIn, checkOut, getAttendance, manualAttendance,
  setupSalary, getSalary, downloadPayslip,
  applyLeave, reviewLeave, getLeaveHistory
};
