const XLSX = require('xlsx');
const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGetRaw } = require('../utils/directQuery');

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

// GET /api/v1/reports/purchases?from=&to=&company_id= — raw material
// purchases (raw_material_stock_logs rows with quantity > 0, i.e. stock
// added rather than consumed by production), grouped back into the
// original purchase event via purchase_id so multi-item purchases show
// as one row with a total, matching the Purchase Report spec (Date |
// Supplier | Items | Total Amount). purchase_id/supplier_name/
// price_per_unit are a phase18 addition — rows from before that
// migration (or the older addStock flow, which never set them) fall
// back to one ungrouped row each with no computable total.
const getPurchasesReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const buildQS = (selectClause) => {
      const parts = [
        `select=${encodeURIComponent(selectClause)}`,
        'quantity=gt.0',
        'order=logged_date.desc',
      ];
      if (companyId) parts.push(`company_id=eq.${companyId}`);
      if (from) parts.push(`logged_date=gte.${from}`);
      if (to)   parts.push(`logged_date=lte.${to}`);
      return parts.join('&');
    };

    let rows;
    try {
      rows = await pgrestGetRaw(`raw_material_stock_logs?${buildQS(
        'id,quantity,supplier_name,purchase_id,price_per_unit,logged_date,note,raw_materials(name,unit)'
      )}`);
    } catch (e) {
      rows = await pgrestGetRaw(`raw_material_stock_logs?${buildQS(
        'id,quantity,logged_date,note,raw_materials(name,unit)'
      )}`);
      rows = (rows || []).map((r) => ({ ...r, supplier_name: null, purchase_id: null, price_per_unit: null }));
    }

    const groups = new Map();
    (rows || []).forEach((r) => {
      const key = r.purchase_id || r.id; // no purchase_id (pre-migration row) — its own group of one
      if (!groups.has(key)) {
        groups.set(key, {
          purchase_id: r.purchase_id || r.id,
          date: r.logged_date,
          supplier_name: r.supplier_name || 'Direct Purchase',
          items: [],
          total_amount: 0,
        });
      }
      const g = groups.get(key);
      const qty = Number(r.quantity);
      const price = r.price_per_unit !== null && r.price_per_unit !== undefined ? Number(r.price_per_unit) : null;
      g.items.push({
        material_name: r.raw_materials?.name || 'Unknown',
        unit: r.raw_materials?.unit || '',
        quantity: qty,
        price_per_unit: price,
      });
      if (price !== null) g.total_amount += qty * price;
    });

    const purchases = Array.from(groups.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    const grandTotal = purchases.reduce((s, p) => s + p.total_amount, 0);

    return success(res, { purchases, grand_total: grandTotal });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/reports/expenses?from=&to=&company_id= — expense rows plus
// a total, for the Reports page's Expense panel (the plain CRUD list
// lives at /api/v1/expenses — see expenses.controller.js).
const getExpensesReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const parts = [
      'select=id,category,amount,description,expense_date',
      'order=expense_date.desc',
    ];
    if (companyId) parts.push(`company_id=eq.${companyId}`);
    if (from) parts.push(`expense_date=gte.${from}`);
    if (to)   parts.push(`expense_date=lte.${to}`);

    const expenses = await pgrestGetRaw(`expenses?${parts.join('&')}`);
    const totalAmount = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);

    return success(res, { expenses: expenses || [], total_amount: totalAmount });
  } catch (err) { return error(res, err.message); }
};

module.exports = { exportReport, getOutstanding, getPurchasesReport, getExpensesReport };
