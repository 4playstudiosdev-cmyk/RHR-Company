const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

// PKR 10/bag total on Tile Bond production — Rs 1 straight to the Head
// (every day bags are logged for their team, regardless of the Head's
// own attendance), the remaining Rs 9 split evenly across Workers marked
// present that day. See sql/phase43_manufacturing_employees.sql.
const RATE_PER_BAG = 10;
const HEAD_SHARE_PER_BAG = 1;
const WORKER_POOL_PER_BAG = RATE_PER_BAG - HEAD_SHARE_PER_BAG;

// ───────────────────────────── Heads ─────────────────────────────

const getHeads = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: '*', order: 'full_name.asc', is_active: 'eq.true' };
    if (companyId) params.company_id = `eq.${companyId}`;
    const data = await pgrestGet('manufacturing_heads', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const createHead = async (req, res) => {
  try {
    const { full_name, phone, company_id } = req.body;
    if (!full_name) return error(res, 'full_name is required', 400);
    const targetCompanyId = req.user.role === 'branch_admin' ? req.user.company_id : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    const [data] = await pgrestPost('manufacturing_heads', {
      company_id: targetCompanyId,
      full_name,
      phone: phone || null,
    });
    return success(res, data, 'Head of Manufacturing added', 201);
  } catch (err) { return error(res, err.message); }
};

const updateHead = async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('manufacturing_heads', filter, { full_name, phone });
    if (!data?.[0]) return error(res, 'Head not found or access denied', 404);
    return success(res, data[0], 'Head updated');
  } catch (err) { return error(res, err.message); }
};

const deleteHead = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('manufacturing_heads', filter, { is_active: false });
    if (!data?.[0]) return error(res, 'Head not found or access denied', 404);
    return success(res, { deleted: true }, 'Head removed');
  } catch (err) { return error(res, err.message); }
};

// ───────────────────────────── Workers ─────────────────────────────

const getWorkers = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: '*,manufacturing_heads(full_name)',
      order: 'full_name.asc',
      is_active: 'eq.true',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (req.query.head_id) params.head_id = `eq.${req.query.head_id}`;
    const data = await pgrestGet('manufacturing_workers', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

const createWorker = async (req, res) => {
  try {
    const { full_name, phone, head_id, company_id } = req.body;
    if (!full_name || !head_id) return error(res, 'full_name and head_id are required', 400);
    const targetCompanyId = req.user.role === 'branch_admin' ? req.user.company_id : (company_id || req.user.company_id);
    if (!targetCompanyId) return error(res, 'company_id is required', 400);

    const heads = await pgrestGet('manufacturing_heads', { select: 'id', id: `eq.${head_id}`, company_id: `eq.${targetCompanyId}` });
    if (!heads?.[0]) return error(res, 'Head not found in this branch', 404);

    const [data] = await pgrestPost('manufacturing_workers', {
      company_id: targetCompanyId,
      head_id,
      full_name,
      phone: phone || null,
    });
    return success(res, data, 'Worker added', 201);
  } catch (err) { return error(res, err.message); }
};

const updateWorker = async (req, res) => {
  try {
    const { full_name, phone, head_id } = req.body;
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('manufacturing_workers', filter, { full_name, phone, head_id });
    if (!data?.[0]) return error(res, 'Worker not found or access denied', 404);
    return success(res, data[0], 'Worker updated');
  } catch (err) { return error(res, err.message); }
};

const deleteWorker = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('manufacturing_workers', filter, { is_active: false });
    if (!data?.[0]) return error(res, 'Worker not found or access denied', 404);
    return success(res, { deleted: true }, 'Worker removed');
  } catch (err) { return error(res, err.message); }
};

// ───────────────────────────── Attendance ─────────────────────────────

// GET /manufacturing/attendance?head_id=&date=
const getAttendance = async (req, res) => {
  try {
    const { head_id, date } = req.query;
    if (!head_id || !date) return error(res, 'head_id and date are required', 400);

    const workers = await pgrestGet('manufacturing_workers', {
      select: 'id,full_name,phone',
      head_id: `eq.${head_id}`,
      is_active: 'eq.true',
      order: 'full_name.asc',
    });

    const workerIds = (workers || []).map((w) => w.id);
    let attendanceRows = [];
    if (workerIds.length) {
      attendanceRows = await pgrestGet('manufacturing_attendance', {
        select: 'worker_id,present',
        worker_id: `in.(${workerIds.join(',')})`,
        attendance_date: `eq.${date}`,
      });
    }
    const presentByWorker = Object.fromEntries((attendanceRows || []).map((a) => [a.worker_id, a.present]));

    const data = (workers || []).map((w) => ({
      ...w,
      // null = not marked yet this day, as distinct from explicitly absent.
      present: w.id in presentByWorker ? presentByWorker[w.id] : null,
    }));

    return success(res, data);
  } catch (err) { return error(res, err.message); }
};

// POST /manufacturing/attendance — { date, entries: [{ worker_id, present }] }
const saveAttendance = async (req, res) => {
  try {
    const { date, entries } = req.body;
    if (!date || !Array.isArray(entries) || !entries.length) {
      return error(res, 'date and a non-empty entries array are required', 400);
    }

    for (const { worker_id, present } of entries) {
      if (!worker_id) continue;
      const existing = await pgrestGet('manufacturing_attendance', {
        select: 'id',
        worker_id: `eq.${worker_id}`,
        attendance_date: `eq.${date}`,
      });
      if (existing?.[0]) {
        await pgrestPatch('manufacturing_attendance', { id: `eq.${existing[0].id}` }, { present: !!present });
      } else {
        await pgrestPost('manufacturing_attendance', {
          worker_id,
          attendance_date: date,
          present: !!present,
        });
      }
    }

    return success(res, { saved: true }, 'Attendance saved');
  } catch (err) { return error(res, err.message); }
};

// ───────────────────────────── Payout ─────────────────────────────

// POST /manufacturing/payout — { head_id, date, bags_produced }
// Computes and saves the day's Rs 10/bag split for one Head's team.
// Idempotent-ish: re-running for the same head+date replaces that day's
// rows (old ones deleted first) rather than stacking duplicates, so a
// correction to bags_produced or attendance can just be re-run.
const calculatePayout = async (req, res) => {
  try {
    const { head_id, date, bags_produced } = req.body;
    const bags = Number(bags_produced);
    if (!head_id || !date || !bags || bags <= 0) {
      return error(res, 'head_id, date and a positive bags_produced are required', 400);
    }

    const heads = await pgrestGet('manufacturing_heads', { select: 'id,company_id,full_name', id: `eq.${head_id}` });
    const head = heads?.[0];
    if (!head) return error(res, 'Head not found', 404);
    if (req.user.role === 'branch_admin' && head.company_id !== req.user.company_id) {
      return error(res, 'Access denied', 403);
    }

    const workers = await pgrestGet('manufacturing_workers', {
      select: 'id,full_name',
      head_id: `eq.${head_id}`,
      is_active: 'eq.true',
    });
    const workerIds = (workers || []).map((w) => w.id);

    let presentWorkerIds = [];
    if (workerIds.length) {
      const attendanceRows = await pgrestGet('manufacturing_attendance', {
        select: 'worker_id',
        worker_id: `in.(${workerIds.join(',')})`,
        attendance_date: `eq.${date}`,
        present: 'eq.true',
      });
      presentWorkerIds = (attendanceRows || []).map((a) => a.worker_id);
    }

    // Replace any existing rows for this head+date (head row + every
    // worker row) before writing the new ones, so re-running never
    // double-counts.
    await pgrestDelete('manufacturing_earnings', { head_id: `eq.${head_id}`, earning_date: `eq.${date}` });

    const headAmount = Number((bags * HEAD_SHARE_PER_BAG).toFixed(2));
    await pgrestPost('manufacturing_earnings', {
      company_id: head.company_id,
      head_id,
      worker_id: null,
      role: 'head',
      earning_date: date,
      bags_produced: bags,
      amount: headAmount,
      created_by: req.user.id,
    });

    const workerPool = bags * WORKER_POOL_PER_BAG;
    const perWorkerAmount = presentWorkerIds.length > 0
      ? Number((workerPool / presentWorkerIds.length).toFixed(2))
      : 0;

    for (const workerId of presentWorkerIds) {
      await pgrestPost('manufacturing_earnings', {
        company_id: head.company_id,
        head_id,
        worker_id: workerId,
        role: 'worker',
        earning_date: date,
        bags_produced: bags,
        amount: perWorkerAmount,
        created_by: req.user.id,
      });
    }

    return success(res, {
      head_amount: headAmount,
      worker_pool: Number(workerPool.toFixed(2)),
      present_worker_count: presentWorkerIds.length,
      per_worker_amount: perWorkerAmount,
      unallocated: presentWorkerIds.length === 0 ? Number(workerPool.toFixed(2)) : 0,
    }, presentWorkerIds.length === 0
      ? 'Payout saved — no workers were marked present, so the Rs 9/bag worker pool is unallocated'
      : 'Payout calculated and saved');
  } catch (err) { return error(res, err.message); }
};

// GET /manufacturing/earnings?head_id=&from=&to=
const getEarnings = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { head_id, from, to } = req.query;
    const params = {
      select: '*,manufacturing_heads(full_name),manufacturing_workers(full_name)',
      order: 'earning_date.desc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (head_id) params.head_id = `eq.${head_id}`;
    if (from) params.earning_date = `gte.${from}`;
    let data = await pgrestGet('manufacturing_earnings', params);
    if (to) data = (data || []).filter((e) => e.earning_date <= to);
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

module.exports = {
  getHeads, createHead, updateHead, deleteHead,
  getWorkers, createWorker, updateWorker, deleteWorker,
  getAttendance, saveAttendance,
  calculatePayout, getEarnings,
};
