const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw } = require('../utils/directQuery');

// GET /api/v1/analytics/salesman/:id
const getSalesmanAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    const now   = new Date();
    const m     = month || now.getMonth() + 1;
    const y     = year  || now.getFullYear();
    const start = new Date(y, m - 1, 1).toISOString();
    const end   = new Date(y, m, 0).toISOString();

    // Orders this month
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, status, created_at')
      .eq('salesman_id', id)
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
      .select('id, customer_id, notes, visited_at, users!customer_id(full_name)')
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

    const totalSales = orders?.reduce((s, o) => s + Number(o.total_amount), 0) || 0;
    const totalCollected = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;

    return success(res, {
      period:          `${m}/${y}`,
      totalOrders:     orders?.length || 0,
      totalSales,
      totalCollected,
      totalVisits:     visits?.length || 0,
      totalCustomers:  totalCustomers || 0,
      orders,
      payments,
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
      pgrestGetRaw(`orders?select=id,total_amount,status&${dateFilter('created_at', companyEq)}`),
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
