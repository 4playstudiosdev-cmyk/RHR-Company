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
        .is('invoice_deleted_at', null)
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
// a total, for the Reports page's read-only Expense report tab (adding an
// expense itself is Expenses.js's job, via /api/v1/expenses). Same full
// select (vehicle/paid-from included) as expenses.controller.js#getExpenses,
// with the same progressive migration fallback, so both pages show
// identical detail.
const getExpensesReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    const filters = [];
    if (companyId) filters.push(`company_id=eq.${companyId}`);
    if (from) filters.push(`expense_date=gte.${from}`);
    if (to)   filters.push(`expense_date=lte.${to}`);
    const filterStr = filters.length ? `&${filters.join('&')}` : '';

    let expenses;
    try {
      expenses = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),salesman_id,salesmen(full_name),manufacturing_worker_id,manufacturing_workers(full_name),created_at&order=expense_date.desc${filterStr}`
      );
    } catch (e00) {
    try {
      expenses = await pgrestGetRaw(
        `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),vehicle_id,vehicles(name,plate_number),created_at&order=expense_date.desc${filterStr}`
      );
    } catch (e) {
      try {
        expenses = await pgrestGetRaw(
          `expenses?select=id,company_id,category,amount,description,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),driver_id,drivers(full_name,car_number),created_at&order=expense_date.desc${filterStr}`
        );
      } catch (e2) {
        expenses = await pgrestGetRaw(`expenses?select=id,category,amount,description,expense_date&order=expense_date.desc${filterStr}`);
      }
    }
    }

    const totalAmount = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);

    return success(res, { expenses: expenses || [], total_amount: totalAmount });
  } catch (err) { return error(res, err.message); }
};

// GET /reports/sale-detail?from=&to=&customer_id=&salesman_id=&product=&company_id=
const getSaleReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to, customer_id, salesman_id, product } = req.query;

    let q = supabaseAdmin
      .from('orders')
      .select('id,order_number,total_amount,created_at,users!customer_id(id,full_name,shop_name),salesmen(id,full_name),order_items(id,product_name,quantity,unit_price,subtotal,products(unit))')
      .neq('status', 'cancelled')
      .is('invoice_deleted_at', null)
      .order('created_at', { ascending: false });

    if (companyId) q = q.eq('company_id', companyId);
    if (from) q = q.gte('created_at', `${from}T00:00:00`);
    if (to)   q = q.lte('created_at', `${to}T23:59:59`);
    if (customer_id) q = q.eq('customer_id', customer_id);
    if (salesman_id) q = q.eq('salesman_id', salesman_id);

    const { data: orders, error: qErr } = await q;
    if (qErr) throw new Error(qErr.message);

    // Flatten to per-item rows
    let rows = [];
    (orders || []).forEach((o) => {
      (o.order_items || []).forEach((item) => {
        if (product && !item.product_name?.toLowerCase().includes(product.toLowerCase())) return;
        rows.push({
          date: o.created_at,
          order_number: o.order_number,
          customer: o.users?.shop_name || o.users?.full_name || '—',
          salesman: o.salesmen?.full_name || '—',
          product_name: item.product_name,
          unit: item.products?.unit || '—',
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
        });
      });
    });

    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const grandTotal = rows.reduce((s, r) => s + r.subtotal, 0);
    return success(res, { rows, total_qty: totalQty, grand_total: grandTotal });
  } catch (err) { return error(res, err.message); }
};

// GET /reports/customer-summary?company_id=
const getCustomerSummary = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    let q = supabaseAdmin
      .from('users')
      .select('id,full_name,shop_name,phone,salesman_id,salesmen(full_name)')
      .eq('role', 'customer')
      .eq('is_approved', true)
      .order('full_name');
    if (companyId) q = q.eq('company_id', companyId);
    const { data: customers } = await q;

    const rows = await Promise.all((customers || []).map(async (c) => {
      const [salesRes, payRes, ledgerRes] = await Promise.all([
        supabaseAdmin.from('orders').select('total_amount').eq('customer_id', c.id).neq('status', 'cancelled'),
        supabaseAdmin.from('payments').select('amount').eq('customer_id', c.id).eq('status', 'approved'),
        supabaseAdmin.from('ledger_entries').select('running_balance').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(1),
      ]);
      const totalSales = (salesRes.data || []).reduce((s, o) => s + Number(o.total_amount), 0);
      const totalRecovery = (payRes.data || []).reduce((s, p) => s + Number(p.amount), 0);
      const currentBalance = ledgerRes.data?.[0]?.running_balance || 0;
      return {
        customer_id: c.id,
        full_name: c.full_name,
        shop_name: c.shop_name,
        phone: c.phone,
        salesman: c.salesmen?.full_name || '—',
        total_sales: totalSales,
        total_recovery: totalRecovery,
        current_balance: currentBalance,
      };
    }));

    return success(res, rows);
  } catch (err) { return error(res, err.message); }
};

// GET /reports/customer-ledger/:id?from=&to=
const getCustomerLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    let q = supabaseAdmin
      .from('ledger_entries')
      .select('id,entry_type,debit,credit,running_balance,description,created_at,order_id,payment_id')
      .eq('customer_id', id)
      .order('created_at', { ascending: true });
    if (from) q = q.gte('created_at', `${from}T00:00:00`);
    if (to)   q = q.lte('created_at', `${to}T23:59:59`);
    const { data, error: qErr } = await q;
    if (qErr) throw new Error(qErr.message);
    return success(res, data || []);
  } catch (err) { return error(res, err.message); }
};

// GET /reports/vendor-summary?company_id=
const getVendorSummary = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const parts = [
      'select=supplier_name,quantity,price_per_unit,logged_date',
      'quantity=gt.0',
      'supplier_name=not.is.null',
    ];
    if (companyId) parts.push(`company_id=eq.${companyId}`);
    const rows = await pgrestGetRaw(`raw_material_stock_logs?${parts.join('&')}`);

    const map = new Map();
    (rows || []).forEach((r) => {
      const key = r.supplier_name;
      if (!map.has(key)) map.set(key, { supplier_name: key, total_purchases: 0, transaction_count: 0 });
      const g = map.get(key);
      if (r.price_per_unit != null) g.total_purchases += Number(r.quantity) * Number(r.price_per_unit);
      g.transaction_count += 1;
    });

    const vendors = Array.from(map.values()).sort((a, b) => b.total_purchases - a.total_purchases);
    return success(res, vendors);
  } catch (err) { return success(res, []); }
};

// GET /reports/vendor-ledger?vendor=<name>&from=&to=&company_id=
const getVendorLedger = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { vendor, from, to } = req.query;
    if (!vendor) return error(res, 'vendor name required', 400);

    const parts = [
      'select=id,quantity,price_per_unit,logged_date,note,purchase_id,raw_materials(name,unit)',
      'quantity=gt.0',
      `supplier_name=eq.${encodeURIComponent(vendor)}`,
    ];
    if (companyId) parts.push(`company_id=eq.${companyId}`);
    if (from) parts.push(`logged_date=gte.${from}`);
    if (to)   parts.push(`logged_date=lte.${to}`);

    const rows = await pgrestGetRaw(`raw_material_stock_logs?${parts.join('&')}&order=logged_date.asc`);
    let running = 0;
    const ledger = (rows || []).map((r) => {
      const amount = r.price_per_unit != null ? Number(r.quantity) * Number(r.price_per_unit) : 0;
      running += amount;
      return {
        date: r.logged_date,
        description: `${r.raw_materials?.name || 'Item'} — ${r.quantity} ${r.raw_materials?.unit || ''}${r.note ? ` (${r.note})` : ''}`,
        debit: amount,
        credit: 0,
        running_balance: running,
      };
    });
    return success(res, ledger);
  } catch (err) { return success(res, []); }
};

// GET /reports/recovery?from=&to=&customer_id=&salesman_id=&method=&status=&company_id=
const getRecoveryReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to, customer_id, salesman_id, method, status } = req.query;

    // Regular payments
    let pq = supabaseAdmin
      .from('payments')
      .select('id,amount,method,status,created_at,notes,bank_account_id,bank_accounts(account_name,bank_name),users!customer_id(full_name,shop_name),salesmen(full_name)')
      .order('created_at', { ascending: false });
    if (companyId) pq = pq.eq('company_id', companyId);
    if (from) pq = pq.gte('created_at', `${from}T00:00:00`);
    if (to)   pq = pq.lte('created_at', `${to}T23:59:59`);
    if (customer_id) pq = pq.eq('customer_id', customer_id);
    if (salesman_id) pq = pq.eq('salesman_id', salesman_id);
    if (method && method !== 'all') pq = pq.eq('method', method);
    if (status && status !== 'all') pq = pq.eq('status', status);
    const { data: payments } = await pq;

    // Salesman recoveries (cheques)
    let chequeParts = [
      'select=id,amount,method,status,created_at,notes,cheque_number,cheque_bank,cheque_date,cleared_at,cleared_bank_account_id,bank_accounts:bank_accounts!cleared_bank_account_id(account_name,bank_name),customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)',
      'order=created_at.desc',
    ];
    if (companyId) chequeParts.push(`company_id=eq.${companyId}`);
    if (from) chequeParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   chequeParts.push(`created_at=lte.${to}T23:59:59`);
    if (customer_id) chequeParts.push(`customer_id=eq.${customer_id}`);
    if (salesman_id) chequeParts.push(`salesman_id=eq.${salesman_id}`);
    if (status && status !== 'all') chequeParts.push(`status=eq.${status}`);

    let cheques = [];
    try {
      cheques = await pgrestGetRaw(`salesman_recoveries?${chequeParts.join('&')}`);
      if (method && method !== 'all' && method !== 'cheque') cheques = [];
    } catch (e) { /* phase72 not run */ }

    const merged = [
      ...(payments || []).map((p) => ({
        id: p.id,
        date: p.created_at,
        customer: p.users?.shop_name || p.users?.full_name || '—',
        salesman: p.salesmen?.full_name || '—',
        method: p.method,
        deposit_to: p.bank_accounts ? `${p.bank_accounts.account_name} — ${p.bank_accounts.bank_name}` : (p.method === 'cash' ? 'Cash' : '—'),
        cheque_number: '—',
        cheque_date: '—',
        status: p.status,
        amount: Number(p.amount),
        source: 'payment',
      })),
      ...(cheques || []).map((c) => ({
        id: c.id,
        date: c.created_at,
        customer: c.customer?.shop_name || c.customer?.full_name || '—',
        salesman: c.salesman?.full_name || '—',
        method: 'cheque',
        deposit_to: c.bank_accounts ? `${c.bank_accounts.account_name} — ${c.bank_accounts.bank_name}` : '—',
        cheque_number: c.cheque_number || '—',
        cheque_date: c.cheque_date ? new Date(c.cheque_date).toLocaleDateString('en-GB') : '—',
        status: c.status,
        amount: Number(c.amount),
        source: 'cheque',
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalCleared = merged.filter((r) => r.status === 'approved' || r.status === 'cleared').reduce((s, r) => s + r.amount, 0);
    const totalPending = merged.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
    return success(res, { rows: merged, total_cleared: totalCleared, total_pending: totalPending });
  } catch (err) { return error(res, err.message); }
};

// GET /reports/cash-complete?from=&to=&company_id=
// Merges ALL cash-money movement into one chronological list:
//   1. salesman_recoveries (payment_type=cash, approved)   → Cash IN
//   2. payments (method=cash, approved, no bank_account)   → Cash IN
//   3. expenses (method=cash)                              → Cash OUT
//   4. salesman_cash_closings (approved)                   → Cash OUT (deposited)
const getCashReport = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    // ── 1. Salesman / driver cash recoveries ──
    const recParts = [
      'select=id,amount,payment_type,recovery_date,created_at,notes,salesmen(full_name),drivers(full_name),users!customer_id(full_name,shop_name)',
      'payment_type=eq.cash',
      'status=eq.approved',
      'order=recovery_date.desc',
    ];
    if (companyId) recParts.push(`company_id=eq.${companyId}`);
    if (from) recParts.push(`recovery_date=gte.${from}`);
    if (to)   recParts.push(`recovery_date=lte.${to}`);
    let recoveries = [];
    try { recoveries = await pgrestGetRaw(`salesman_recoveries?${recParts.join('&')}`); } catch (_) {}

    // ── 2. Old-style payments table (method=cash, no bank account) ──
    const payParts = [
      'select=id,amount,created_at,users!customer_id(full_name,shop_name),salesmen!salesman_id(full_name)',
      'method=eq.cash',
      'status=eq.approved',
      'bank_account_id=is.null',
      'order=created_at.desc',
    ];
    if (companyId) payParts.push(`company_id=eq.${companyId}`);
    if (from) payParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   payParts.push(`created_at=lte.${to}T23:59:59`);
    let oldPayments = [];
    try { oldPayments = await pgrestGetRaw(`payments?${payParts.join('&')}`); } catch (_) {}

    // ── 3. Cash expenses (cash OUT) ──
    const expParts = [
      'select=id,amount,category,description,expense_date,salesmen(full_name)',
      'method=eq.cash',
      'order=expense_date.desc',
    ];
    if (companyId) expParts.push(`company_id=eq.${companyId}`);
    if (from) expParts.push(`expense_date=gte.${from}`);
    if (to)   expParts.push(`expense_date=lte.${to}`);
    let expenses = [];
    try { expenses = await pgrestGetRaw(`expenses?${expParts.join('&')}`); } catch (_) {}

    // ── 4. Cash deposits / closings (cash OUT — handed to bank or petty cash) ──
    const closParts = [
      'select=id,amount,deposit_to,bank_account,closing_date,created_at,salesmen(full_name)',
      'status=eq.approved',
      'order=closing_date.desc',
    ];
    if (companyId) closParts.push(`company_id=eq.${companyId}`);
    if (from) closParts.push(`closing_date=gte.${from}`);
    if (to)   closParts.push(`closing_date=lte.${to}`);
    let closings = [];
    try { closings = await pgrestGetRaw(`salesman_cash_closings?${closParts.join('&')}`); } catch (_) {}

    const rows = [
      ...(recoveries || []).map((r) => ({
        date:        r.recovery_date || r.created_at,
        type:        'recovery',
        label:       'Cash Recovery',
        person:      r.salesmen?.full_name || r.drivers?.full_name || '—',
        customer:    r.users?.shop_name || r.users?.full_name || '—',
        description: r.notes || 'Cash collected from customer',
        amount_in:   Number(r.amount),
        amount_out:  0,
      })),
      ...(oldPayments || []).map((p) => ({
        date:        p.created_at,
        type:        'payment',
        label:       'Cash Payment',
        person:      p.salesmen?.full_name || '—',
        customer:    p.users?.shop_name || p.users?.full_name || '—',
        description: 'Cash payment (direct)',
        amount_in:   Number(p.amount),
        amount_out:  0,
      })),
      ...(expenses || []).map((e) => ({
        date:        e.expense_date,
        type:        'expense',
        label:       'Cash Expense',
        person:      e.salesmen?.full_name || '—',
        customer:    '—',
        description: `${e.category}${e.description ? ` — ${e.description}` : ''}`,
        amount_in:   0,
        amount_out:  Number(e.amount),
      })),
      ...(closings || []).map((c) => ({
        date:        c.closing_date || c.created_at,
        type:        'deposit',
        label:       'Cash Deposit',
        person:      c.salesmen?.full_name || '—',
        customer:    '—',
        description: `Deposited → ${c.deposit_to === 'bank' ? `Bank${c.bank_account ? ` (${c.bank_account})` : ''}` : 'Petty Cash'}`,
        amount_in:   0,
        amount_out:  Number(c.amount),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalIn  = rows.reduce((s, r) => s + r.amount_in,  0);
    const totalOut = rows.reduce((s, r) => s + r.amount_out, 0);

    return success(res, { rows, total_in: totalIn, total_out: totalOut, net: totalIn - totalOut });
  } catch (err) { return error(res, err.message); }
};

module.exports = { exportReport, getOutstanding, getPurchasesReport, getExpensesReport, getSaleReport, getCustomerSummary, getCustomerLedger, getVendorSummary, getVendorLedger, getRecoveryReport, getCashReport };
