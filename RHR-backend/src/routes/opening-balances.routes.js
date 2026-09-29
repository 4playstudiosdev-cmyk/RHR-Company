const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/role.middleware');
const { success, error } = require('../utils/response');
const { pgrestGet, pgrestPost, pgrestPatch } = require('../utils/directQuery');
const { resolveCompanyId } = require('../utils/companyScope');

// GET /api/v1/opening-balances?entity_type=customer
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = { select: '*', order: 'created_at.desc' };
    if (companyId) params.company_id = `eq.${companyId}`;
    if (req.query.entity_type) params.entity_type = `eq.${req.query.entity_type}`;
    const data = await pgrestGet('opening_balances', params);
    return success(res, data);
  } catch (err) { return error(res, err.message); }
});

// POST /api/v1/opening-balances
// entity_type: 'customer' | 'vendor' | 'raw_material' | 'finished_good'
// Customer entries additionally write a matching ledger_entries row so the
// customer's running balance is correct from day one (same running_balance
// pattern ledger.controller.js#addManualEntry already uses). Raw material /
// finished good entries directly set the live stock on that item, the same
// way the existing "set stock" PATCHes (production/materials/:id and
// products/:id/stock) already work.
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const {
      entity_type, entity_id, entity_name,
      balance_type, amount, quantity, unit, notes, balance_date
    } = req.body;

    if (!entity_type || !entity_name) {
      return error(res, 'entity_type and entity_name are required', 400);
    }

    const companyId = req.user.company_id;
    const row = {
      company_id:   companyId,
      entity_type,
      entity_id:    entity_id || null,
      entity_name,
      balance_type: balance_type || null,
      amount:       amount !== undefined && amount !== '' ? Number(amount) : null,
      quantity:     quantity !== undefined && quantity !== '' ? Number(quantity) : null,
      unit:         unit || null,
      notes:        notes || null,
      balance_date: balance_date || new Date().toISOString().split('T')[0],
      created_by:   req.user.id,
    };

    if (entity_type === 'customer') {
      if (!entity_id) return error(res, 'entity_id (customer id) is required', 400);
      if (!balance_type || !['debit', 'credit'].includes(balance_type)) {
        return error(res, "balance_type must be 'debit' or 'credit' for a customer opening balance", 400);
      }
      if (!amount || Number(amount) <= 0) return error(res, 'A positive amount is required', 400);

      const last = await pgrestGet('ledger_entries', {
        select: 'running_balance',
        customer_id: `eq.${entity_id}`,
        order: 'created_at.desc',
        limit: '1',
      });
      const prevBalance = Number(last?.[0]?.running_balance) || 0;
      const newBalance = balance_type === 'debit' ? prevBalance + Number(amount) : prevBalance - Number(amount);

      await pgrestPost('ledger_entries', {
        company_id:      companyId,
        customer_id:     entity_id,
        entry_type:      balance_type,
        amount:          Number(amount),
        running_balance: newBalance,
        description:     notes || 'Opening balance',
        reference_type:  'opening_balance',
        created_by:      req.user.id,
      });
    }

    if (entity_type === 'raw_material') {
      if (!entity_id || quantity === undefined || quantity === '') {
        return error(res, 'entity_id (raw material id) and quantity are required', 400);
      }
      await pgrestPatch('raw_materials', { id: `eq.${entity_id}` }, { stock: Number(quantity) });
    }

    if (entity_type === 'finished_good') {
      if (!entity_id || quantity === undefined || quantity === '') {
        return error(res, 'entity_id (product id) and quantity are required', 400);
      }
      await pgrestPatch('products', { id: `eq.${entity_id}` }, { stock_quantity: Number(quantity) });
    }

    const [data] = await pgrestPost('opening_balances', row);
    return success(res, data, 'Opening balance recorded', 201);
  } catch (err) { return error(res, err.message); }
});

// DELETE /api/v1/opening-balances/:id — removes the record row only;
// deliberately does not reverse the ledger entry / stock it caused, since
// by the time someone wants to delete a stale opening-balance record,
// real transactions have likely already layered on top of it.
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { pgrestDelete } = require('../utils/directQuery');
    await pgrestDelete('opening_balances', { id: `eq.${req.params.id}` });
    return success(res, { deleted: true }, 'Opening balance record removed');
  } catch (err) { return error(res, err.message); }
});

module.exports = router;
