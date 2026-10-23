const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw } = require('../utils/directQuery');

// GET /api/v1/analytics/salesman/:id
const getSalesmanAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, from, to } = req.query;

    let start, end, period;
    if (from && to) {
      // The dates are Pakistan dates — cut the day at Pakistan midnight (the
      // server itself runs on UTC).
      start = new Date(`${from}T00:00:00+05:00`).toISOString();
      end = new Date(`${to}T23:59:59.999+05:00`).toISOString();
      period = `${from} to ${to}`;
    } else {
      const now = new Date();
      const m = month || now.getMonth() + 1;
      const y = year || now.getFullYear();
      start = new Date(y, m - 1, 1).toISOString();
      end = new Date(y, m, 0).toISOString();
      period = `${m}/${y}`;
    }

    // Orders this month — customer_id/name included so the frontend can
    // group into a per-customer breakdown (My Performance's date-range
    // view) without a second round trip.
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, status, created_at, customer_id, users!customer_id(full_name)')
      .eq('salesman_id', id)
      .is('invoice_deleted_at', null)
      .gte('created_at', start)
      .lte('created_at', end);

    // Payments collected this month
    const { data: payments } = await supabaseAdmin
      .from('payments')
      .select('amount, status, created_at')
      .eq('salesman_id', id)
      .eq('status', 'approved')
      .gte('created_at', start)
      .lte('created_at', end);

    // Customer visits this month
    const { data: visits } = await supabaseAdmin
      .from('customer_visits')
      .select('id, customer_id, notes, visited_at, latitude, longitude, users!customer_id(full_name, shop_name, shop_latitude, shop_longitude)')
      .eq('salesman_id', id)
      .gte('visited_at', start)
      .lte('visited_at', end)
      .order('visited_at', { ascending: false });

    // Assigned customers count
    const { count: totalCustomers } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact' })
      .eq('salesman_id', id)
      .eq('is_approved', true);

    // ── Detail for the admin's Salesman Performance view ──────────────
    // Cancelled / undelivered orders are not sales (same rule as the dashboard).
    const isSale = (o) => !['cancelled', 'undelivered'].includes(o.status);
    const saleOrders = (orders || []).filter(isSale);
    const totalSales = saleOrders.reduce((s, o) => s + Number(o.total_amount), 0);

    // What the salesman collected from customers (cash, bank transfer and
    // online) — salesman_recoveries is where the app records it. The older
    // `payments` table (customer-submitted) is added on top for completeness.
    const [recoveries, closings, cashRows, closedRows, customers] = await Promise.all([
      pgrestGet('salesman_recoveries', {
        select: 'id,amount,payment_type,payment_method,status,recovery_date,created_at,customer_id,notes,users!customer_id(full_name,shop_name)',
        salesman_id: `eq.${id}`,
        status: 'neq.deleted',
        and: `(created_at.gte.${start},created_at.lte.${end})`,
        order: 'created_at.desc',
      }),
      pgrestGet('salesman_cash_closings', {
        select: 'id,amount,deposit_to,bank_account,status,closing_date,created_at',
        salesman_id: `eq.${id}`,
        and: `(created_at.gte.${start},created_at.lte.${end})`,
        order: 'created_at.desc',
      }),
      // cash in hand is all-time (not date-ranged): approved cash collected
      // minus approved deposits — same formula as the salesman's own app
      pgrestGet('salesman_recoveries', { select: 'amount', salesman_id: `eq.${id}`, payment_type: 'eq.cash', status: 'eq.approved' }),
      pgrestGet('salesman_cash_closings', { select: 'amount,status', salesman_id: `eq.${id}`, status: 'in.(approved,pending)' }),
      pgrestGet('users', { select: 'id,full_name,shop_name,phone', salesman_id: `eq.${id}`, role: 'eq.customer', is_approved: 'eq.true', order: 'shop_name.asc' }),
    ]);
    const sum = (rows) => (rows || []).reduce((t, r) => t + Number(r.amount), 0);
    const approvedRec = (recoveries || []).filter((r) => r.status === 'approved');
    const collectedCash = sum(approvedRec.filter((r) => r.payment_type === 'cash'));
    const collectedBank = sum(approvedRec.filter((r) => r.payment_type !== 'cash'));
    const pendingRec = (recoveries || []).filter((r) => r.status === 'pending');
    const legacyCollected = payments?.reduce((t, p) => t + Number(p.amount), 0) || 0;
    const totalCollected = collectedCash + collectedBank + legacyCollected;

    const totalCashCollected = sum(cashRows);
    const totalDeposited = sum((closedRows || []).filter((c) => c.status === 'approved'));
    const pendingDeposit = sum((closedRows || []).filter((c) => c.status === 'pending'));

    // Customer-wise: this salesman's customers, with orders / sales / what was
    // collected from each in the period, and what each still owes right now.
    const balances = await Promise.all((customers || []).map((c) =>
      pgrestGet('ledger_entries', { select: 'running_balance', customer_id: `eq.${c.id}`, order: 'created_at.desc', limit: '1' })
        .then((r) => Number(r?.[0]?.running_balance) || 0).catch(() => null)));
    const customerBreakdown = (customers || []).map((c, i) => {
      const co = saleOrders.filter((o) => o.customer_id === c.id);
      const cr = approvedRec.filter((r) => r.customer_id === c.id);
      return {
        id: c.id,
        name: c.shop_name || c.full_name,
        contact: c.shop_name ? c.full_name : null,
        phone: c.phone,
        orders: co.length,
        sales: co.reduce((t, o) => t + Number(o.total_amount), 0),
        collected: sum(cr),
        outstanding: balances[i],
      };
    });

    return success(res, {
      period,
      totalOrders:     saleOrders.length,
      cancelledOrders: (orders?.length || 0) - saleOrders.length,
      deliveredOrders: saleOrders.filter((o) => o.status === 'delivered').length,
      totalSales,
      totalCollected,
      collectedCash,
      collectedBank,
      pendingCollected: sum(pendingRec),
      pendingCount:     pendingRec.length,
      cashInHand:       totalCashCollected - totalDeposited,
      totalCashCollected,
      totalDeposited,
      pendingDeposit,
      totalVisits:     visits?.length || 0,
      totalCustomers:  totalCustomers || 0,
      customerBreakdown,
      recoveries:      recoveries || [],
      closings:        closings || [],
      orders,
      // chart input: approved collections in the period
      payments: [
        ...approvedRec.map((r) => ({ amount: r.amount, status: r.status, created_at: r.created_at })),
        ...(payments || []),
      ],
      visits,
    });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/analytics/dashboard?from=&to=&company_id=
// Quick stats for admin dashboard. company_id was hardcoded to
// req.user.company_id — for super_admin (always Karachi) that meant
// Revenue/Outstanding silently only ever reflected Karachi, even though
// the Dashboard is meant to show the whole business. Now uses
// resolveCompanyId (super_admin: whatever the CityFilter dropdown sent,
// or every branch combined if omitted/"all"; branch_admin: always their
// own). from/to (YYYY-MM-DD) optionally scope orders/payments/new-customer
// counts to a date range — totalProducts stays a live snapshot regardless,
// since "how much stock exists right now" isn't a time-ranged question.
// Routed through the raw-https bypass (see utils/directQuery.js) — same
// class of Railway/supabase-js silent-empty-read bug already fixed for
// salesmen/drivers/raw_materials; this endpoint was never migrated.
const getDashboardStats = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const dateFilter = (field, extra) => {
      const parts = Object.entries(extra)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      if (from) parts.push(`${field}=gte.${encodeURIComponent(from + 'T00:00:00')}`);
      if (to)   parts.push(`${field}=lte.${encodeURIComponent(to + 'T23:59:59')}`);
      return parts.join('&');
    };

    const companyEq = companyId ? { company_id: `eq.${companyId}` } : {};

    const [orders, payments, customers, products] = await Promise.all([
      // Cancelled / undelivered orders are not sales — same rule as the top cards
      // (routes/dashboard.routes.js NOT_SALES), so both rows of the dashboard agree.
      pgrestGetRaw(`orders?select=id,total_amount,status&${dateFilter('created_at', { ...companyEq, status: 'not.in.(cancelled,undelivered)' })}`),
      pgrestGetRaw(`payments?select=amount&status=eq.approved&${dateFilter('created_at', companyEq)}`),
      pgrestGetRaw(`users?select=id&role=eq.customer&is_approved=eq.true&${dateFilter('created_at', companyEq)}`),
      pgrestGet('products', { select: 'id', is_active: 'eq.true', ...companyEq }),
    ]);

    const totalRevenue   = orders?.reduce((s, o) => s + Number(o.total_amount), 0) || 0;
    const totalCollected = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
    const outstanding    = totalRevenue - totalCollected;

    return success(res, {
      totalOrders:    orders?.length || 0,
      totalRevenue,
      totalCollected,
      outstanding,
      totalCustomers: customers?.length || 0,
      totalProducts:  products?.length || 0,
    });
  } catch (err) { return error(res, err.message); }
};

module.exports = { getSalesmanAnalytics, getDashboardStats };
