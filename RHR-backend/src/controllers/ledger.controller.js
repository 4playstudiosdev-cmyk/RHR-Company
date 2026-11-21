const { supabaseAdmin } = require('../config/supabase');
const { success, error } = require('../utils/response');
const { buildStatementPDF } = require('../services/statement.service');
const paymentMessages = require('../services/paymentMessages.service');
const { buildExcelBuffer } = require('../services/excel.service');
const { pgrestGet, pgrestGetRaw, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

// Shared access rule: customer sees only their own ledger, salesman only his
// customers' ledgers, admin roles see everything in their company.
const canAccessLedger = async (user, customerId) => {
  if (user.role === 'customer') return customerId === user.id;

  if (user.role === 'salesman') {
    const { data: customer } = await supabaseAdmin
      .from('users')
      .select('salesman_id')
      .eq('id', customerId)
      .single();
    return !!customer && customer.salesman_id === user.id;
  }

  return true;
};

// POST /api/v1/ledger/adjustment
// Admin manually adds a debit or credit entry — opening balance, adjustment, discount, etc.
const adjustLedger = async (req, res) => {
  try {
    const { customer_id, entry_type, amount, description, reference_type, reference_id } = req.body;

    if (!customer_id || !entry_type || !amount || !description)
      return error(res, 'customer_id, entry_type, amount, description are required', 400);

    if (!['debit', 'credit'].includes(entry_type))
      return error(res, 'entry_type must be debit or credit', 400);

    if (isNaN(Number(amount)) || Number(amount) <= 0)
      return error(res, 'amount must be a positive number', 400);

    // Verify the customer exists and belongs to this admin's company
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('users')
      .select('id, company_id')
      .eq('id', customer_id)
      .eq('role', 'customer')
      .single();

    if (custErr || !customer) return error(res, 'Customer not found', 404);
    if (customer.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    // Get last running balance
    const { data: last } = await supabaseAdmin
      .from('ledger_entries')
      .select('running_balance')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const prevBalance = last?.running_balance || 0;
    const newBalance  = entry_type === 'debit'
      ? prevBalance + Number(amount)
      : prevBalance - Number(amount);

    const { data, error: dbErr } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        company_id:      req.user.company_id,
        customer_id,
        entry_type,
        amount:          Number(amount),
        running_balance: newBalance,
        description,
        reference_type:  reference_type || 'adjustment',
        reference_id:    reference_id   || null,
        created_by:      req.user.id
      })
      .select()
      .single();

    if (dbErr) throw new Error(dbErr.message);
    return success(res, data, 'Ledger entry added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/ledger/:customerId/balance — super admin only.
// Sets a customer's outstanding balance to an exact figure. The ledger itself is
// never rewritten: the difference between the current balance and the new one is
// posted as a normal debit (balance goes up) or credit (balance goes down) entry,
// so the customer's ledger, statement, the salesman's view and the apps all show
// it right away, with the running balance landing on exactly the new number.
// A negative figure means the customer is in credit (has paid in advance).
const setOutstandingBalance = async (req, res) => {
  try {
    const { customerId } = req.params;
    const target = Number(req.body?.balance);
    if (!Number.isFinite(target)) return error(res, 'balance must be a number', 400);
    const note = String(req.body?.note || '').trim().slice(0, 200);

    const { data: customer } = await supabaseAdmin
      .from('users').select('id, company_id, full_name, shop_name, phone, whatsapp_phone, salesman_id').eq('id', customerId).eq('role', 'customer').single();
    if (!customer) return error(res, 'Customer not found', 404);

    const { data: last } = await supabaseAdmin
      .from('ledger_entries').select('running_balance')
      .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const current = Number(last?.running_balance) || 0;
    const diff = Math.round((target - current) * 100) / 100;
    if (diff === 0) return success(res, { balance: current, changed: false }, 'Balance is already that amount');

    const fmt = (n) => 'PKR ' + n.toLocaleString('en-US');
    const { data, error: dbErr } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        company_id:      customer.company_id,
        customer_id:     customerId,
        entry_type:      diff > 0 ? 'debit' : 'credit',
        amount:          Math.abs(diff),
        running_balance: target,
        description:     'Balance adjusted by admin: ' + fmt(current) + ' → ' + fmt(target) + (note ? ' — ' + note : ''),
        reference_type:  'adjustment',
        created_by:      req.user.id,
      })
      .select()
      .single();
    if (dbErr) throw new Error(dbErr.message);

    // tell the customer and their salesman (app + push + WhatsApp); never blocks the response
    paymentMessages.balanceChanged({ customer, previous: current, current: target });

    return success(res, { balance: target, previous: current, changed: true, entry: data }, 'Outstanding balance updated');
  } catch (err) { return error(res, err.message); }
};

const getLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    // Fetch ALL entries sorted ASC to recompute running_balance correctly.
    // created_at is set to recovery_date for backdated entries, so the stored
    // running_balance snapshot can be wrong; recomputing fixes the display.
    const { data: allData, error: dbError } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    if (dbError) throw new Error(dbError.message);

    // Opening balance always leads, then chronological
    const sorted = [...(allData || [])].sort((a, b) => {
      const aOp = a.reference_type === 'opening_balance' ? 0 : 1;
      const bOp = b.reference_type === 'opening_balance' ? 0 : 1;
      if (aOp !== bOp) return aOp - bOp;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    let bal = 0;
    const recalculated = sorted.map(entry => {
      bal = entry.entry_type === 'debit' ? bal + Number(entry.amount) : bal - Number(entry.amount);
      return { ...entry, running_balance: bal };
    });
    const currentBalance = bal;

    // Apply date filter and return newest-first
    let data = recalculated;
    if (from_date) data = data.filter(e => e.created_at >= from_date);
    if (to_date)   data = data.filter(e => e.created_at <= to_date + 'T23:59:59.999Z');

    // Name the vendor on direct-vendor-transfer entries so the money trail can be verified
    // from the customer side (old entries only say "settled via supplier").
    const recIds = [...new Set(data.filter(e => e.reference_type === 'recovery' && e.reference_id).map(e => e.reference_id))];
    if (recIds.length) {
      try {
        const recs = await pgrestGetRaw(
          `salesman_recoveries?select=id,suppliers!vendor_id(name)&payment_type=eq.vendor_transfer&id=in.(${recIds.join(',')})`
        );
        const vendorByRec = Object.fromEntries((recs || []).filter(r => r.suppliers?.name).map(r => [r.id, r.suppliers.name]));
        data = data.map(e => {
          const vendor = vendorByRec[e.reference_id];
          if (!vendor || (e.description || '').includes(vendor)) return e;
          return { ...e, description: `Direct vendor transfer to ${vendor} — customer balance settled` };
        });
      } catch (_) { /* vendor_id column or join unavailable — leave descriptions as stored */ }
    }

    // Older entries (e.g. early Sukkur ones) were saved without reference_id, so
    // match them to this customer's approved vendor transfer of the same amount and day.
    const unlinked = data.filter(e => e.reference_type === 'recovery' && !e.reference_id
      && /vendor transfer/i.test(e.description || '') && !/vendor transfer to /i.test(e.description || ''));
    if (unlinked.length) {
      try {
        const recs = await pgrestGetRaw(
          `salesman_recoveries?select=id,amount,recovery_date,created_at,suppliers!vendor_id(name)&payment_type=eq.vendor_transfer&status=eq.approved&customer_id=eq.${customerId}&order=created_at.asc`
        );
        const pool = (recs || []).filter(r => r.suppliers?.name).map(r => ({ ...r, used: false }));
        const vendorByEntry = {};
        for (const e of unlinked) {
          const day = String(e.created_at || '').slice(0, 10);
          const r = pool.find(x => !x.used && Number(x.amount) === Number(e.amount)
            && String(x.recovery_date || x.created_at || '').slice(0, 10) === day);
          if (r) { r.used = true; vendorByEntry[e.id] = r.suppliers.name; }
        }
        data = data.map(e => vendorByEntry[e.id]
          ? { ...e, description: `Direct vendor transfer to ${vendorByEntry[e.id]} — customer balance settled` }
          : e);
      } catch (_) { /* vendor_id column or join unavailable — leave descriptions as stored */ }
    }
    data = [...data].reverse();

    return success(res, { entries: data, currentBalance });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/ledger/:customerId/statement
// Streams a PDF ledger statement for the given customer/date range
const downloadStatement = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    const { data: customer, error: custErr } = await supabaseAdmin
      .from('users')
      .select('full_name, phone, shop_name, shop_address, company_id')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) return error(res, 'Customer not found', 404);

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, city, phone, address')
      .eq('id', customer.company_id)
      .single();

    const { data: allRaw, error: dbError } = await supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    if (dbError) throw new Error(dbError.message);

    // Recompute running_balance sequentially (same as getLedger)
    let bal = 0;
    const recalculated = (allRaw || []).map(entry => {
      bal = entry.entry_type === 'debit' ? bal + Number(entry.amount) : bal - Number(entry.amount);
      return { ...entry, running_balance: bal };
    });

    // Apply date filter
    let entries = recalculated;
    if (from_date) entries = entries.filter(e => e.created_at >= from_date);
    if (to_date)   entries = entries.filter(e => e.created_at <= to_date + 'T23:59:59.999Z');

    const currentBalance = entries.length > 0 ? entries[entries.length - 1].running_balance : 0;

    // Order-type ledger entries only ever say "Order KHI-2026-00015
    // confirmed" — no product detail. One batched lookup fetches what was
    // actually in each referenced order, so the statement can show real
    // items instead of just the generic confirmation text. Best-effort:
    // a lookup failure just means those rows fall back to the plain
    // description, never breaks the statement itself.
    const orderEntryIds = entries.filter((e) => e.reference_type === 'order').map((e) => e.reference_id);
    let itemsByOrderId = {};
    if (orderEntryIds.length > 0) {
      try {
        const { data: items } = await supabaseAdmin
          .from('order_items')
          .select('order_id, product_name, quantity')
          .in('order_id', orderEntryIds);
        (items || []).forEach((it) => {
          if (!itemsByOrderId[it.order_id]) itemsByOrderId[it.order_id] = [];
          itemsByOrderId[it.order_id].push(`${it.quantity}x ${it.product_name}`);
        });
      } catch (e) { /* non-fatal */ }
    }
    const enrichedEntries = entries.map((e) => ({
      ...e,
      itemsSummary: e.reference_type === 'order' ? (itemsByOrderId[e.reference_id] || []).join(', ') : null,
    }));

    const pdfBuffer = await buildStatementPDF({
      customer, company, entries: enrichedEntries,
      fromDate: from_date, toDate: to_date, currentBalance
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${customerId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/ledger/:customerId/statement/excel
// Streams an Excel export of the ledger entries for the given date range
const downloadStatementExcel = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { from_date, to_date } = req.query;
    const user = req.user;

    if (!(await canAccessLedger(user, customerId)))
      return error(res, 'Access denied', 403);

    let query = supabaseAdmin
      .from('ledger_entries')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date)   query = query.lte('created_at', to_date);

    const { data: entries, error: dbError } = await query;
    if (dbError) throw new Error(dbError.message);

    const rows = entries.map(e => ({
      Date:        new Date(e.created_at).toLocaleDateString('en-GB'),
      Description: e.description || '',
      Type:        (e.entry_type || '').toUpperCase(),
      Amount:      e.amount,
      Balance:     e.running_balance
    }));

    const buffer = buildExcelBuffer('Statement', rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${customerId}.xlsx"`);
    return res.send(buffer);
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/ledger/:customerId/entry/:entryId
// Deletes a customer ledger entry and cascades to vendor ledger + salesman recovery.
const deleteLedgerEntry = async (req, res) => {
  try {
    const { customerId, entryId } = req.params;
    if (!await canAccessLedger(req.user, customerId))
      return error(res, 'Access denied', 403);

    // Fetch the entry to delete
    const entryRows = await pgrestGetRaw(
      `ledger_entries?select=id,customer_id,amount,entry_type,reference_type,reference_id,created_at&id=eq.${entryId}&customer_id=eq.${customerId}&limit=1`
    ).catch(() => []);
    const entry = entryRows?.[0];
    if (!entry) return error(res, 'Ledger entry not found', 404);

    // Delete the customer ledger entry
    await pgrestDelete('ledger_entries', { id: `eq.${entryId}` });

    // Recalc customer running balance
    try {
      const allLed = await pgrestGetRaw(
        `ledger_entries?select=id,amount,entry_type&customer_id=eq.${customerId}&order=created_at.asc&limit=1000`
      ).catch(() => []);
      let bal = 0;
      for (const le of (allLed || [])) {
        bal = le.entry_type === 'debit' ? bal + Number(le.amount) : bal - Number(le.amount);
        await pgrestPatch('ledger_entries', { id: `eq.${le.id}` }, { running_balance: bal });
      }
    } catch (_) {}

    // Cascade: if entry is linked to a salesman_recovery, delete it + vendor ledger + expense
    const recoveryId = entry.reference_id;
    if (recoveryId && (entry.reference_type === 'recovery' || entry.reference_type === 'vendor_transfer')) {
      try {
        const recRows = await pgrestGetRaw(
          `salesman_recoveries?select=id,amount,recovery_date,payment_type,vendor_id,company_id&id=eq.${recoveryId}&limit=1`
        ).catch(() => []);
        const rec = recRows?.[0];
        if (rec) {
          const expDate = (rec.recovery_date || '').split('T')[0];

          // Delete expense
          if (rec.payment_type === 'vendor_transfer') {
            try {
              const expRows = await pgrestGet('expenses', {
                select: 'id',
                company_id: `eq.${rec.company_id}`,
                category: 'eq.Vendor Payment',
                amount: `eq.${Number(rec.amount)}`,
                expense_date: `eq.${expDate}`,
                order: 'created_at.desc',
                limit: '1',
              });
              if (expRows?.[0]) await pgrestDelete('expenses', { id: `eq.${expRows[0].id}` });
            } catch (_) {}

            // Delete supplier ledger entry
            try {
              const sleRows = await pgrestGetRaw(
                `supplier_ledger_entries?select=id,supplier_id&reference_type=eq.vendor_transfer&amount=eq.${Number(rec.amount)}&created_at=gte.${expDate}T00:00:00.000Z&created_at=lte.${expDate}T23:59:59.999Z&limit=3`
              ).catch(() => []);
              for (const sle of (sleRows || [])) {
                await pgrestDelete('supplier_ledger_entries', { id: `eq.${sle.id}` });
                // Recalc supplier balance
                try {
                  const { recalcSupplierLedger } = require('../services/orderLedger.service');
                  await recalcSupplierLedger(sle.supplier_id);
                } catch (_) {}
              }
            } catch (_) {}
          }

          // Delete the recovery itself
          await pgrestDelete('salesman_recoveries', { id: `eq.${rec.id}` });
        }
      } catch (_) { /* non-fatal */ }
    }

    return success(res, { deleted: true }, 'Ledger entry deleted');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/ledger/:customerId/entry/:entryId
// Accepts { entry_date } — updates created_at and recalculates running balances.
const updateLedgerEntry = async (req, res) => {
  try {
    const { customerId, entryId } = req.params;
    const { entry_date } = req.body;
    if (!entry_date) return error(res, 'entry_date is required', 400);
    if (!await canAccessLedger(req.user, customerId))
      return error(res, 'Access denied', 403);

    await pgrestPatch('ledger_entries', { id: `eq.${entryId}` }, { created_at: `${entry_date}T12:00:00.000Z` });

    // Re-fetch all and recalculate running balances
    const allLed = await pgrestGetRaw(
      `ledger_entries?select=id,amount,entry_type,reference_type&customer_id=eq.${customerId}&order=created_at.asc&limit=5000`
    ).catch(() => []);
    let bal = 0;
    for (const le of (allLed || [])) {
      bal = le.entry_type === 'debit' ? bal + Number(le.amount) : bal - Number(le.amount);
      await pgrestPatch('ledger_entries', { id: `eq.${le.id}` }, { running_balance: bal });
    }

    return success(res, { updated: true }, 'Entry date updated');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getLedger, adjustLedger, setOutstandingBalance, downloadStatement, downloadStatementExcel, deleteLedgerEntry, updateLedgerEntry };
