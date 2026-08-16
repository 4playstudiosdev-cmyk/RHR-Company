const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');

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

// GET /api/v1/analytics/dashboard
// Quick stats for admin dashboard
const getDashboardStats = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const [orders, payments, customers, products] = await Promise.all([
      supabaseAdmin.from('orders').select('id, total_amount, status').eq('company_id', companyId),
      supabaseAdmin.from('payments').select('amount').eq('company_id', companyId).eq('status','approved'),
      supabaseAdmin.from('users').select('id', {count:'exact'}).eq('company_id', companyId).eq('role','customer').eq('is_approved', true),
      supabaseAdmin.from('products').select('id, stock_quantity').eq('company_id', companyId).eq('is_active', true),
    ]);

    const totalRevenue   = orders.data?.reduce((s,o) => s + Number(o.total_amount), 0) || 0;
    const totalCollected = payments.data?.reduce((s,p) => s + Number(p.amount), 0) || 0;
    const outstanding    = totalRevenue - totalCollected;

    return success(res, {
      totalOrders:    orders.data?.length || 0,
      totalRevenue,
      totalCollected,
      outstanding,
      totalCustomers: customers.count || 0,
      totalProducts:  products.data?.length || 0,
    });
  } catch (err) { return error(res, err.message); }
};

module.exports = { getSalesmanAnalytics, getDashboardStats };
