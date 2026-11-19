const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { pgrestGet, pgrestGetRaw } = require('../utils/directQuery');
const { success, error } = require('../utils/response');

// GET /api/v1/cash-ledger?date=2026-11-09&company_id=...
// Returns cash recoveries and closings for a specific date, with opening and closing balance.
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

    const [prevRec, prevClose, dayRec, dayClose] = await Promise.all([
      // Cash recoveries BEFORE this date (for opening balance)
      pgrestGet('salesman_recoveries', {
        select: 'amount',
        status: 'eq.approved',
        payment_type: 'eq.cash',
        ...cfObj,
        recovery_date: `lt.${date}`,
      }).catch(() => []),

      // Cash closings BEFORE this date (for opening balance)
      pgrestGet('salesman_cash_closings', {
        select: 'amount',
        status: 'eq.approved',
        deposit_to: 'eq.petty_cash',
        ...cfObj,
        closing_date: `lt.${date}`,
      }).catch(() => []),

      // Cash recoveries ON this date
      pgrestGetRaw(
        `salesman_recoveries?select=amount,recovery_date,users!customer_id(full_name,shop_name),salesmen(full_name)&status=eq.approved&payment_type=eq.cash${cf}&recovery_date=eq.${date}&order=created_at.asc`
      ).catch(() =>
        pgrestGet('salesman_recoveries', {
          select: 'amount,recovery_date',
          status: 'eq.approved',
          payment_type: 'eq.cash',
          ...cfObj,
          recovery_date: `eq.${date}`,
          order: 'created_at.asc',
        }).catch(() => [])
      ),

      // Cash closings ON this date
      pgrestGetRaw(
        `salesman_cash_closings?select=amount,closing_date,salesmen(full_name)&status=eq.approved${cf}&closing_date=eq.${date}&order=created_at.asc`
      ).catch(() =>
        pgrestGet('salesman_cash_closings', {
          select: 'amount,closing_date',
          status: 'eq.approved',
          ...cfObj,
          closing_date: `eq.${date}`,
          order: 'created_at.asc',
        }).catch(() => [])
      ),
    ]);

    const openingBalance =
      (prevRec || []).reduce((s, r) => s + Number(r.amount || 0), 0) -
      (prevClose || []).reduce((s, c) => s + Number(c.amount || 0), 0);

    // Merge and sort by entry order (recoveries first, then closings, both already ordered by created_at)
    const rawEntries = [
      ...(dayRec || []).map(r => ({
        type: 'recovery',
        date: r.recovery_date || date,
        description: `Cash Recovery — ${r.users?.shop_name || r.users?.full_name || 'Customer'}${r.salesmen?.full_name ? ` via ${r.salesmen.full_name}` : ''}`,
        debit: Number(r.amount || 0),
        credit: 0,
      })),
      ...(dayClose || []).map(c => ({
        type: 'deposit',
        date: c.closing_date || date,
        description: `Cash Deposit — ${c.salesmen?.full_name || 'Salesman'}`,
        debit: 0,
        credit: Number(c.amount || 0),
      })),
    ];

    let bal = openingBalance;
    const entries = rawEntries.map((e, i) => {
      bal += e.debit - e.credit;
      return { sno: i + 1, ...e, running_balance: bal };
    });

    const totalIn = entries.reduce((s, e) => s + e.debit, 0);
    const totalOut = entries.reduce((s, e) => s + e.credit, 0);
    const closingBalance = openingBalance + totalIn - totalOut;

    return success(res, {
      date,
      opening_balance: openingBalance,
      entries,
      total_in: totalIn,
      total_out: totalOut,
      closing_balance: closingBalance,
    });
  } catch (err) {
    console.error('Cash ledger error:', err);
    return error(res, err.message || 'Failed to fetch cash ledger', 500);
  }
});

module.exports = router;
