const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin }      = require('../middleware/role.middleware');
const { pgrestGet }    = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// GET /api/v1/daily-dashboard?from=2026-09-01&to=2026-09-01&company_id=xxx
// One-shot business-overview read for the Daily Management Dashboard —
// financial summary, order/production stats, salesman performance and
// low-stock alerts, all for one date range/branch. Routed entirely
// through the pgrestGet raw-https bypass (see utils/directQuery.js) —
// every list endpoint added since the documented Railway/supabase-js
// silent-empty-read bug was found uses this instead of plain supabase-js.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // DateRangeFilter's "All Time" preset sends from/to as empty strings,
    // not omitted — the `= today` defaults above only fire on undefined,
    // so an empty string slipped through and built an invalid
    // `gte.T00:00:00` timestamp. Treat blank the same as "not provided".
    let { from, to, company_id } = req.query;
    if (!from) from = '2000-01-01';
    if (!to) to = today;
    const requestedCompanyId = company_id === 'all' ? null : company_id;
    const companyId = req.user.role === 'branch_admin'
      ? req.user.company_id : (requestedCompanyId || req.user.company_id);
    // companyFilter is applied to every query below; null (super_admin
    // picked "All Cities") means company-wide across all branches.
    const companyFilter = companyId ? { company_id: `eq.${companyId}` } : {};

    const [
      orders, productions, recoveries, expenses,
      cashClosings, rawMaterials, products,
      salesmen, dispatches
    ] = await Promise.all([
      pgrestGet('orders', {
        select: 'id,total_amount,status,salesman_id,created_at',
        ...companyFilter,
        created_at: `gte.${from}T00:00:00`,
      }).then((rows) => (rows || []).filter((o) => o.created_at <= `${to}T23:59:59`)),

      pgrestGet('productions', {
        select: 'id,qty_produced,total_cost,finished_item_id,date',
        ...companyFilter,
        date: `gte.${from}`,
      }).then((rows) => (rows || []).filter((p) => p.date <= to)),

      pgrestGet('salesman_recoveries', {
        select: 'id,amount,salesman_id,payment_type,status,recovery_date',
        ...companyFilter,
        status: 'eq.approved',
        recovery_date: `gte.${from}`,
      }).then((rows) => (rows || []).filter((r) => r.recovery_date <= to)),

      pgrestGet('expenses', {
        select: 'id,amount,category,expense_date',
        ...companyFilter,
        expense_date: `gte.${from}`,
      }).then((rows) => (rows || []).filter((e) => e.expense_date <= to)),

      pgrestGet('salesman_cash_closings', {
        select: 'id,amount,salesman_id,status,closing_date',
        ...companyFilter,
        status: 'eq.approved',
        closing_date: `gte.${from}`,
      }).then((rows) => (rows || []).filter((c) => c.closing_date <= to)),

      pgrestGet('raw_materials', {
        select: 'id,name,stock,min_level,unit',
        ...companyFilter,
      }),

      pgrestGet('products', {
        select: 'id,name,stock_quantity,unit',
        ...companyFilter,
        is_active: 'eq.true',
      }),

      pgrestGet('salesmen', {
        select: 'id,full_name',
        ...companyFilter,
        is_active: 'eq.true',
      }),

      pgrestGet('dispatches', {
        select: 'id,qty,status,dispatched_at',
        ...companyFilter,
        dispatched_at: `gte.${from}T00:00:00`,
      }).then((rows) => (rows || []).filter((d) => d.dispatched_at <= `${to}T23:59:59`)),
    ]);

    const ordersData     = orders || [];
    const productionData = productions || [];
    const recoveryData   = recoveries || [];
    const expenseData    = expenses || [];
    const salesmenData   = salesmen || [];
    const rawMatsData    = rawMaterials || [];
    const productsData   = products || [];
    const dispatchData   = dispatches || [];

    // ── FINANCIAL SUMMARY
    const totalSales    = ordersData.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const totalRecovery = recoveryData.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExpenses = expenseData.reduce((s, e) => s + Number(e.amount || 0), 0);

    // Cash in hand = cash recoveries collected minus approved cash closings
    // (deposits) in this range — same running concept as
    // GET /recovery/cash-in-hand/:salesmanId, just summed company-wide.
    const totalCashIn  = recoveryData
      .filter((r) => r.payment_type === 'cash')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalCashOut = (cashClosings || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const cashInHand   = totalCashIn - totalCashOut;

    // ── ORDER STATS
    const deliveredOrders = ordersData.filter((o) => o.status === 'delivered' || o.status === 'dispatched').length;
    const pendingOrders = ordersData.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;

    // ── PRODUCTION STATS
    const totalBagsProduced   = productionData.reduce((s, p) => s + Number(p.qty_produced || 0), 0);
    const totalBagsDispatched = dispatchData.reduce((s, d) => s + Number(d.qty || 0), 0);

    // ── COGS — productions.total_cost (set by runProduction, see
    // production.controller.js). Note: until raw material purchase rates
    // are wired into that cost calculation, this may read as 0 — it's not
    // a dashboard bug, the source figure itself isn't populated yet.
    const totalProductionCost = productionData.reduce((s, p) => s + Number(p.total_cost || 0), 0);
    const dailyProfit = totalSales - totalProductionCost - totalExpenses;

    // ── LOW STOCK ALERTS
    const lowRawMaterials = rawMatsData.filter((m) =>
      Number(m.stock) <= Number(m.min_level || 0) && Number(m.min_level || 0) > 0
    );
    const lowProducts = productsData.filter((p) => Number(p.stock_quantity) <= 5);

    // ── SALESMAN PERFORMANCE
    const salesmanPerformance = salesmenData.map((s) => {
      const salesmanOrders = ordersData.filter((o) => o.salesman_id === s.id);
      const salesmanSales = salesmanOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const salesmanRecovery = recoveryData.filter((r) => r.salesman_id === s.id)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      return {
        id: s.id,
        name: s.full_name,
        sales: salesmanSales,
        recovery: salesmanRecovery,
        orders_count: salesmanOrders.length,
      };
    });

    return success(res, {
      date_range: { from, to },
      financial: {
        total_sales: totalSales,
        total_recovery: totalRecovery,
        cash_in_hand: cashInHand,
        total_expenses: totalExpenses,
        total_production_cost: totalProductionCost,
        daily_profit: dailyProfit,
      },
      orders: {
        total: ordersData.length,
        delivered: deliveredOrders,
        pending: pendingOrders,
      },
      production: {
        bags_produced: totalBagsProduced,
        bags_dispatched: totalBagsDispatched,
      },
      salesman_performance: salesmanPerformance,
      low_stock_alerts: {
        raw_materials: lowRawMaterials,
        products: lowProducts,
        has_alerts: lowRawMaterials.length > 0 || lowProducts.length > 0,
      },
    });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
