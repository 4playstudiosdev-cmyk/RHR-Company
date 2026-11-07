const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { pgrestGet, pgrestGetRaw } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// GET /api/v1/daily-report?date=2026-09-23&company_id=...
// Full daily operations report — expenses with running balance, salesman
// recoveries, delivered orders (sales), production, and a summary box.
// Powers the Daily Report page's on-screen tables and its PDF download.
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const date = req.query.date || today;
    const { company_id } = req.query;
    const companyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id && company_id !== 'all' ? company_id : req.user.company_id);
    const cf = companyId ? `&company_id=eq.${companyId}` : '';
    const cfObj = companyId ? { company_id: `eq.${companyId}` } : {};

    const [expenses, recoveries, orders, productions, bankAccounts, prevCashRec, prevCashClose, bankExpenses, bankPayments] = await Promise.all([

      // Expenses for the date — try with full joins, degrade gracefully
      pgrestGetRaw(
        `expenses?select=id,category,description,amount,expense_date,method,bank_account_id,bank_accounts(account_name,bank_name),salesmen(full_name),suppliers(name)&expense_date=eq.${date}${cf}&order=created_at.asc`
      ).catch(() =>
        pgrestGet('expenses', { select: 'id,category,description,amount,expense_date,method,bank_account_id', expense_date: `eq.${date}`, ...cfObj, order: 'created_at.asc' })
      ),

      // Approved recoveries for the date
      pgrestGet('salesman_recoveries', {
        select: 'id,salesman_id,amount,payment_type,recovery_date,notes,salesmen(full_name),users!customer_id(full_name,shop_name)',
        status: 'eq.approved',
        recovery_date: `eq.${date}`,
        ...cfObj,
        order: 'created_at.asc',
      }),

      // Delivered orders with items — use order_date if set, else fall back
      // to updated_at so back-dated orders appear on their back-dated day.
      pgrestGetRaw(
        `orders?select=id,order_number,total_amount,updated_at,created_at,order_date,users!customer_id(full_name,shop_name),order_items(id,product_id,product_name,quantity,unit_price,subtotal,products(unit))` +
        `&status=eq.delivered&invoice_deleted_at=is.null${cf}` +
        `&or=(order_date.eq.${date},and(order_date.is.null,updated_at.gte.${date}T00:00:00,updated_at.lte.${date}T23:59:59))` +
        `&order=updated_at.asc`
      ).catch(() =>
        pgrestGet('orders', {
          select: 'id,order_number,total_amount,updated_at,created_at,users!customer_id(full_name,shop_name),order_items(id,product_id,product_name,quantity,unit_price,subtotal,products(unit))',
          status: 'eq.delivered',
          invoice_deleted_at: 'is.null',
          ...cfObj,
          updated_at: `gte.${date}T00:00:00`,
          order: 'updated_at.asc',
        }).then(rows => (rows || []).filter(o => (o.updated_at || '') <= `${date}T23:59:59`))
      ),

      // Productions for the date — join products via finished_item_id FK
      pgrestGetRaw(
        `productions?select=id,qty_produced,total_cost,date,products!finished_item_id(name,unit)&date=eq.${date}${cf}&order=created_at.asc`
      ).catch(() =>
        pgrestGet('productions', { select: 'id,qty_produced,total_cost,date', date: `eq.${date}`, ...cfObj, order: 'created_at.asc' })
      ),

      // Active bank accounts
      pgrestGet('bank_accounts', {
        select: 'id,account_name,account_number,bank_name',
        is_active: 'eq.true',
        ...cfObj,
        order: 'account_name.asc',
      }).catch(() => []),

      // All approved cash recoveries BEFORE this date (for previous balance)
      pgrestGet('salesman_recoveries', {
        select: 'amount',
        status: 'eq.approved',
        payment_type: 'eq.cash',
        ...cfObj,
        recovery_date: `lt.${date}`,
      }).catch(() => []),

      // All approved cash closings BEFORE this date
      pgrestGet('salesman_cash_closings', {
        select: 'amount',
        status: 'eq.approved',
        ...cfObj,
        closing_date: `lt.${date}`,
      }).catch(() => []),

      // Bank expenses for this date (money OUT of each bank account)
      pgrestGet('expenses', {
        select: 'amount,bank_account_id',
        bank_account_id: 'not.is.null',
        expense_date: `eq.${date}`,
        ...cfObj,
      }).catch(() => []),

      // Bank inflows for this date: cheques cleared to bank + bank transfers approved
      pgrestGetRaw(
        `salesman_recoveries?select=amount,cleared_bank_account_id&cheque_status=eq.cleared&cleared_at=gte.${date}T00:00:00${cf}`
      ).then(rows => (rows || []).filter(r => r.cleared_at <= `${date}T23:59:59` && r.cleared_bank_account_id))
        .catch(() => []),
    ]);

    // ── Cost-per-unit map: latest production cost for each sold product
    // Used to compute true COGS (cost of goods sold) for the profit figure.
    const allProductIds = [...new Set(
      (orders || []).flatMap(o => (o.order_items || []).map(it => it.product_id).filter(Boolean))
    )];
    let costMap = {};
    if (allProductIds.length > 0) {
      try {
        const prodCosts = await pgrestGetRaw(
          `productions?select=finished_item_id,total_cost,qty_produced&finished_item_id=in.(${allProductIds.join(',')})${cf}&order=date.desc`
        );
        for (const p of prodCosts || []) {
          if (!costMap[p.finished_item_id] && Number(p.qty_produced) > 0) {
            costMap[p.finished_item_id] = Number(p.total_cost) / Number(p.qty_produced);
          }
        }
      } catch (e) { /* no production records — cost defaults to 0 */ }
    }

    // ── Expenses with running balance
    let runBalance = 0;
    const expenseList = (expenses || []).map((e, i) => {
      runBalance += Number(e.amount || 0);
      return {
        sno: i + 1,
        date: e.expense_date,
        category: e.category || 'Other',
        description: e.description || '',
        account: e.bank_accounts
          ? `${e.bank_accounts.bank_name} — ${e.bank_accounts.account_name}`
          : (e.method === 'cash' ? 'Cash' : e.salesmen?.full_name || e.suppliers?.name || ''),
        amount: Number(e.amount || 0),
        running_balance: runBalance,
        bank_account_id: e.bank_account_id || null,
      };
    });
    const totalExpenses = runBalance;

    // ── Recovery list
    const recoveryList = (recoveries || []).map((r, i) => ({
      sno: i + 1,
      date: r.recovery_date,
      salesman_id: r.salesman_id || null,
      salesman: r.salesmen?.full_name || '',
      customer: r.users?.shop_name || r.users?.full_name || '',
      payment_type: r.payment_type,
      notes: r.notes || '',
      amount: Number(r.amount || 0),
    }));
    const totalRecovery = recoveryList.reduce((s, r) => s + r.amount, 0);

    // ── Sales list (delivered orders)
    const salesList = (orders || []).map((o, i) => {
      const items = o.order_items || [];
      // BAG: items whose unit is NOT a pure-weight unit (KG/G/GRAM)
      // KG: items with pure KG unit (qty = kg directly) + bag items multiplied by kg/bag
      const PURE_WEIGHT = /^(kg|g|gram|grams|ltr|liter|litre|ml)$/i;
      const totalBags = items.reduce((s, it) => {
        const unit = (it.products?.unit || '').trim();
        return PURE_WEIGHT.test(unit) ? s : s + Number(it.quantity || 0);
      }, 0);
      const totalKg = items.reduce((s, it) => {
        const unit = (it.products?.unit || '').trim().toLowerCase();
        if (PURE_WEIGHT.test(unit)) return s + Number(it.quantity || 0);
        const kgM = unit.match(/(\d+)\s*kg/);
        return kgM ? s + Number(it.quantity || 0) * Number(kgM[1]) : s;
      }, 0);
      const orderCOGS = items.reduce((s, it) => {
        const cpUnit = costMap[it.product_id] || 0;
        return s + Number(it.quantity || 0) * cpUnit;
      }, 0);
      return {
        sno: i + 1,
        order_id: o.id,
        date: o.order_date || (o.updated_at || o.created_at || '').split('T')[0],
        order_number: o.order_number,
        customer: o.users?.shop_name || o.users?.full_name || '',
        products: items.map(it => it.product_name).join(', '),
        bags: totalBags,
        kg: totalKg > 0 ? totalKg : null,
        total_amount: Number(o.total_amount || 0),
        cogs: orderCOGS,
        items: items.map(it => ({
          product_name: it.product_name,
          unit: it.products?.unit || '',
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          subtotal: Number(it.subtotal || 0),
        })),
      };
    });
    const totalSales = salesList.reduce((s, o) => s + o.total_amount, 0);
    const totalCOGS = salesList.reduce((s, o) => s + o.cogs, 0);
    const totalSaleBags = salesList.reduce((s, o) => s + o.bags, 0);
    const totalSaleKg = salesList.reduce((s, o) => s + (o.kg || 0), 0);

    // ── Production list
    const productionList = (productions || []).map((p, i) => {
      const bags = Number(p.qty_produced || 0);
      const unitStr = (p.products?.unit || '').trim();
      const kgM = unitStr.match(/(\d+(?:\.\d+)?)\s*kg/i);
      const kgPerBag = kgM ? Number(kgM[1]) : null;
      return {
        sno: i + 1,
        date: p.date,
        product: p.products?.name || 'Product',
        bags,
        kg_per_bag: kgPerBag,
        total_kg: kgPerBag ? bags * kgPerBag : null,
        total_cost: Number(p.total_cost || 0),
      };
    });
    const totalProdBags = productionList.reduce((s, p) => s + p.bags, 0);
    const totalProdKg = productionList.reduce((s, p) => s + (p.total_kg || 0), 0);
    const totalProdCost = productionList.reduce((s, p) => s + p.total_cost, 0);

    // ── Previous cash balance (cash held before this date)
    const prevCashIn = (prevCashRec || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const prevCashOut = (prevCashClose || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const previousCashBalance = prevCashIn - prevCashOut;

    const netCash = previousCashBalance + totalRecovery - totalExpenses;

    // ── Bank detail: debit (in) and credit (out) per account for this date
    const bankExpMap = {};
    (bankExpenses || []).forEach(e => {
      const id = e.bank_account_id;
      bankExpMap[id] = (bankExpMap[id] || 0) + Number(e.amount || 0);
    });
    const bankInMap = {};
    (bankPayments || []).forEach(r => {
      const id = r.cleared_bank_account_id;
      if (id) bankInMap[id] = (bankInMap[id] || 0) + Number(r.amount || 0);
    });
    const bankDetail = (bankAccounts || []).map(b => ({
      id: b.id,
      account_name: b.account_name,
      bank_name: b.bank_name,
      account_number: b.account_number,
      day_debit: bankInMap[b.id] || 0,
      day_credit: bankExpMap[b.id] || 0,
    }));

    return success(res, {
      date,
      expenses: expenseList,
      recovery: recoveryList,
      sales: salesList,
      production: productionList,
      bank_detail: bankDetail,
      summary: {
        previous_cash_balance: previousCashBalance,
        total_recovery: totalRecovery,
        total_expenses: totalExpenses,
        net_cash: netCash,
        cash_in_hand: netCash,
        total_production_bags: totalProdBags,
        total_production_kg: totalProdKg,
        total_sale_bags: totalSaleBags,
        total_sale_kg: totalSaleKg,
        total_sales: totalSales,
        profit: totalSales - totalCOGS,
      },
    });
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
