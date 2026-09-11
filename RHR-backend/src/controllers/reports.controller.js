const XLSX = require('xlsx');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');

// GET /api/v1/reports/outstanding — same per-customer "last ledger balance"
// computation the Excel export below already does, just returned as JSON
// so the Reports page can show it live instead of only as a download.
const getOutstanding = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    let custQuery = supabaseAdmin
      .from('users')
      .select('id, full_name, phone, shop_name')
      .eq('role', 'customer')
      .eq('is_approved', true);
    if (companyId) custQuery = custQuery.eq('company_id', companyId);
    const { data: customers } = await custQuery;

    const rows = await Promise.all((customers || []).map(async (c) => {
      const { data: last } = await supabaseAdmin
        .from('ledger_entries')
        .select('running_balance')
        .eq('customer_id', c.id)
        .order('created_at', { ascending: false })
        .limit(1).single();
      return {
        customer_id: c.id,
        full_name:   c.full_name,
        shop_name:   c.shop_name || null,
        phone:       c.phone,
        outstanding: last?.running_balance || 0
      };
    }));

    rows.sort((a, b) => b.outstanding - a.outstanding);
    return success(res, rows);
  } catch (err) { return error(res, err.message); }
};

const exportReport = async (req, res) => {
  try {
    const { type = 'sales' } = req.query;
    const companyId = resolveCompanyId(req);
    let data = [], sheetName = 'Report';

    if (type === 'sales') {
      let salesQuery = supabaseAdmin
        .from('orders')
        .select('order_number, status, total_amount, created_at, users!customer_id(full_name, phone)')
        .order('created_at', { ascending: false });
      if (companyId) salesQuery = salesQuery.eq('company_id', companyId);
      const { data: orders } = await salesQuery;
      data = orders.map(o => ({
        'Order No':    o.order_number,
        'Customer':    o.users?.full_name,
        'Phone':       o.users?.phone,
        'Status':      o.status,
        'Amount (PKR)':o.total_amount,
        'Date':        new Date(o.created_at).toLocaleDateString('en-GB'),
      }));
      sheetName = 'Sales Report';
    }

    if (type === 'payments') {
      let paymentsQuery = supabaseAdmin
        .from('payments')
        .select('amount, method, status, created_at, users!customer_id(full_name, phone)')
        .order('created_at', { ascending: false });
      if (companyId) paymentsQuery = paymentsQuery.eq('company_id', companyId);
      const { data: payments } = await paymentsQuery;
      data = payments.map(p => ({
        'Customer':    p.users?.full_name,
        'Phone':       p.users?.phone,
        'Amount (PKR)':p.amount,
        'Method':      p.method,
        'Status':      p.status,
        'Date':        new Date(p.created_at).toLocaleDateString('en-GB'),
      }));
      sheetName = 'Payments Report';
    }

    if (type === 'outstanding') {
      let outstandingQuery = supabaseAdmin
        .from('users')
        .select('id, full_name, phone, shop_name')
        .eq('role', 'customer')
        .eq('is_approved', true);
      if (companyId) outstandingQuery = outstandingQuery.eq('company_id', companyId);
      const { data: customers } = await outstandingQuery;

      for (const c of customers) {
        const { data: last } = await supabaseAdmin
          .from('ledger_entries')
          .select('running_balance')
          .eq('customer_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1).single();
        data.push({
          'Customer':       c.full_name,
          'Shop Name':      c.shop_name || '—',
          'Phone':          c.phone,
          'Outstanding (PKR)': last?.running_balance || 0,
        });
      }
      sheetName = 'Outstanding Report';
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
    res.send(buffer);
  } catch (err) { return error(res, err.message); }
};

module.exports = { exportReport, getOutstanding };
