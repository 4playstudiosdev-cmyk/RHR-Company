const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');
const { recalcSupplierLedger } = require('../services/orderLedger.service');

// ─── Supplier Ledger ─────────────────────────────────────────────────────────

// GET /api/v1/suppliers/:id/ledger
const getSupplierLedger = async (req, res) => {
  try {
    const { id } = req.params;
    let data;
    try {
      data = await pgrestGet('supplier_ledger_entries', {
        select: '*',
        supplier_id: `eq.${id}`,
        order: 'created_at.asc',
      });
    } catch (e) {
      return success(res, { entries: [], currentBalance: 0 });
    }
    if (!data?.length) return success(res, { entries: [], currentBalance: 0 });

    // Recalculate on the fly — opening_balance always leads
    const sorted = [...data].sort((a, b) => {
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
    // Return in reverse-chronological order for display
    return success(res, { entries: recalculated.reverse(), currentBalance });
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/suppliers/:id/ledger/adjustment
const adjustSupplierLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { entry_type, amount, description, reference_type: refType, receipt_url, payment_method, payment_date, bank_account_id } = req.body;
    if (!entry_type || !amount || !description)
      return error(res, 'entry_type, amount, description are required', 400);
    if (!['debit', 'credit'].includes(entry_type))
      return error(res, 'entry_type must be debit or credit', 400);
    if (isNaN(Number(amount)) || Number(amount) <= 0)
      return error(res, 'amount must be a positive number', 400);

    const suppliers = await pgrestGet('suppliers', { select: 'id,company_id,name', id: `eq.${id}` });
    const supplier = suppliers?.[0];
    if (!supplier) return error(res, 'Supplier not found', 404);
    if (req.user.role !== 'super_admin' && supplier.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    let last;
    try {
      last = await pgrestGet('supplier_ledger_entries', {
        select: 'running_balance',
        supplier_id: `eq.${id}`,
        order: 'created_at.desc',
        limit: '1',
      });
    } catch (e) {
      return error(res, 'Supplier ledger table not set up yet — run phase77_supplier_ledger.sql in Supabase', 500);
    }
    const prevBalance = Number(last?.[0]?.running_balance) || 0;
    const newBalance = entry_type === 'debit'
      ? prevBalance + Number(amount)
      : prevBalance - Number(amount);

    const entryCreatedAt = payment_date ? new Date(payment_date).toISOString() : undefined;
    const baseEntry = {
      company_id:      supplier.company_id,
      supplier_id:     id,
      entry_type,
      amount:          Number(amount),
      running_balance: newBalance,
      description,
      reference_type:  refType || 'adjustment',
      created_by:      req.user.id,
      ...(entryCreatedAt ? { created_at: entryCreatedAt } : {}),
    };
    let data;
    try {
      [data] = await pgrestPost('supplier_ledger_entries', { ...baseEntry, receipt_url: receipt_url || null });
    } catch (e) {
      // receipt_url column may not exist yet — retry without it
      [data] = await pgrestPost('supplier_ledger_entries', baseEntry);
    }

    // Recalculate all stored running_balance values so the next insert reads a correct base
    try { await recalcSupplierLedger(id); } catch (_) {}

    // Create expense when admin records a payment to supplier
    if (entry_type === 'credit' && (refType || 'adjustment') === 'payment') {
      const expDate = payment_date || new Date().toISOString().split('T')[0];
      const expMethod = payment_method === 'bank' ? 'bank' : payment_method === 'cheque' ? 'bank' : 'cash';
      const expenseBase = {
        company_id:   supplier.company_id,
        category:     'Vendor Payment',
        amount:       Number(amount),
        description:  `Vendor payment to ${supplier.name || 'vendor'} — ${description}`,
        expense_date: expDate,
        method:       expMethod,
        created_by:   req.user.id,
        ...(bank_account_id ? { bank_account_id } : {}),
      };
      // Try with supplier_id first; fall back without if the column doesn't exist yet
      try {
        await pgrestPost('expenses', { ...expenseBase, supplier_id: id });
      } catch (_) {
        try { await pgrestPost('expenses', expenseBase); } catch (_2) { /* non-fatal */ }
      }
    }

    return success(res, data, 'Ledger entry added', 201);
  } catch (err) { return error(res, err.message); }
};

// Helper: recalculate running_balance for all entries (opening_balance first, then created_at asc)
async function recalcRunningBalances(entries) {
  const sorted = [...entries].sort((a, b) => {
    const aOp = a.reference_type === 'opening_balance' ? 0 : 1;
    const bOp = b.reference_type === 'opening_balance' ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return new Date(a.created_at) - new Date(b.created_at);
  });
  let bal = 0;
  for (const e of sorted) {
    bal = e.entry_type === 'debit' ? bal + Number(e.amount) : bal - Number(e.amount);
    if (Number(e.running_balance) !== bal) {
      await pgrestPatch('supplier_ledger_entries', { id: `eq.${e.id}` }, { running_balance: bal });
    }
  }
}

// DELETE /api/v1/suppliers/:id/ledger/:entryId
const deleteSupplierLedgerEntry = async (req, res) => {
  try {
    const { id: supplierId, entryId } = req.params;
    const suppliers = await pgrestGet('suppliers', { select: 'id,company_id', id: `eq.${supplierId}` });
    const supplier = suppliers?.[0];
    if (!supplier) return error(res, 'Supplier not found', 404);
    if (req.user.role !== 'super_admin' && supplier.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    const allEntries = await pgrestGet('supplier_ledger_entries', {
      select: 'id,entry_type,amount,running_balance,reference_type,created_at',
      supplier_id: `eq.${supplierId}`,
      order: 'created_at.asc',
    });
    const entryToDelete = (allEntries || []).find(e => e.id === entryId);
    await pgrestDelete('supplier_ledger_entries', { id: `eq.${entryId}` });
    const remaining = (allEntries || []).filter((e) => e.id !== entryId);
    await recalcRunningBalances(remaining);

    // Delete linked expense if this was a payment or vendor_transfer credit
    if (entryToDelete?.entry_type === 'credit' &&
        (entryToDelete?.reference_type === 'payment' || entryToDelete?.reference_type === 'vendor_transfer')) {
      try {
        const entryDate = (entryToDelete.created_at || '').split('T')[0];
        // Try matching by supplier_id first
        let linked = null;
        try {
          const rows = await pgrestGet('expenses', {
            supplier_id: `eq.${supplierId}`,
            amount: `eq.${Number(entryToDelete.amount)}`,
            category: `eq.Vendor Payment`,
            expense_date: `eq.${entryDate}`,
            order: 'created_at.desc',
            limit: '1',
          });
          if (rows?.[0]?.id) linked = rows[0];
        } catch (_) {}
        // Fallback: match by company_id only (expense may have been created without supplier_id)
        if (!linked) {
          const rows = await pgrestGet('expenses', {
            company_id: `eq.${supplier.company_id}`,
            amount: `eq.${Number(entryToDelete.amount)}`,
            category: `eq.Vendor Payment`,
            expense_date: `eq.${entryDate}`,
            order: 'created_at.desc',
            limit: '1',
          });
          if (rows?.[0]?.id) linked = rows[0];
        }
        if (linked?.id) {
          await pgrestDelete('expenses', { id: `eq.${linked.id}` });
        }
      } catch (_) { /* non-fatal */ }

      // Cascade: delete linked salesman_recovery + customer ledger entry
      if (entryToDelete?.reference_type === 'vendor_transfer') {
        try {
          const { pgrestGetRaw } = require('../utils/directQuery');
          const entryDate = (entryToDelete.created_at || '').split('T')[0];

          // Find linked salesman_recovery (vendor_transfer, same supplier, same amount, same date)
          const recoveries = await pgrestGetRaw(
            `salesman_recoveries?select=id,customer_id&payment_type=eq.vendor_transfer&vendor_id=eq.${supplierId}&amount=eq.${Number(entryToDelete.amount)}&recovery_date=eq.${entryDate}&status=eq.approved&limit=3`
          ).catch(() => []);

          for (const rec of (recoveries || [])) {
            // Delete customer ledger entry (reference_id = recovery.id)
            try {
              const ledRows = await pgrestGetRaw(
                `ledger_entries?select=id,customer_id&reference_id=eq.${rec.id}&limit=5`
              ).catch(() => []);
              for (const le of (ledRows || [])) {
                await pgrestDelete('ledger_entries', { id: `eq.${le.id}` });
              }
              // Recalc customer running balance
              if (rec.customer_id) {
                try {
                  const allLed = await pgrestGetRaw(
                    `ledger_entries?select=id,amount,entry_type&customer_id=eq.${rec.customer_id}&order=created_at.asc&limit=1000`
                  ).catch(() => []);
                  let bal = 0;
                  for (const le of (allLed || [])) {
                    bal = le.entry_type === 'debit' ? bal + Number(le.amount) : bal - Number(le.amount);
                    await pgrestPatch('ledger_entries', { id: `eq.${le.id}` }, { running_balance: bal });
                  }
                } catch (_) {}
              }
            } catch (_) {}

            // Delete the salesman_recovery row itself
            await pgrestDelete('salesman_recoveries', { id: `eq.${rec.id}` });
          }
        } catch (_) { /* non-fatal */ }
      }
    }

    return success(res, { deleted: true }, 'Ledger entry deleted');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/suppliers/:id/ledger/:entryId
const updateSupplierLedgerEntry = async (req, res) => {
  try {
    const { id: supplierId, entryId } = req.params;
    const { amount } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return error(res, 'amount must be a positive number', 400);

    const suppliers = await pgrestGet('suppliers', { select: 'id,company_id', id: `eq.${supplierId}` });
    const supplier = suppliers?.[0];
    if (!supplier) return error(res, 'Supplier not found', 404);
    if (req.user.role !== 'super_admin' && supplier.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    const allEntries = await pgrestGet('supplier_ledger_entries', {
      select: 'id,entry_type,amount,running_balance',
      supplier_id: `eq.${supplierId}`,
      order: 'created_at.asc',
    });
    await pgrestPatch('supplier_ledger_entries', { id: `eq.${entryId}` }, { amount: Number(amount) });
    const updated = (allEntries || []).map((e) => e.id === entryId ? { ...e, amount: Number(amount) } : e);
    await recalcRunningBalances(updated);
    return success(res, { updated: true }, 'Ledger entry updated');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/suppliers?company_id= — active suppliers for the autocomplete
// on Raw Materials → Purchase, and for the standalone Suppliers panel.
const SELECT_FIELDS = 'id,company_id,name,address,contact_number,categories,is_active,created_at';

const getSuppliers = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: SELECT_FIELDS,
      is_active: 'eq.true',
      order: 'name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    let data;
    try {
      data = await pgrestGet('suppliers', params);
    } catch (e) {
      // address/contact_number/categories are a later addition on top of
      // the original phase21 table — fall back to the plain columns if
      // that part hasn't run yet.
      data = await pgrestGet('suppliers', { ...params, select: 'id,company_id,name,is_active,created_at' });
    }
    return success(res, data);
  } catch (err) {
    // suppliers is a phase21 addition — read as empty rather than
    // breaking the purchase modal/Suppliers panel before it's run.
    return success(res, []);
  }
};

// POST /api/v1/suppliers — manual add (the Suppliers panel's own "Add"
// button). Case-insensitive unique per branch (see phase21's index) —
// re-adding an existing name just returns the existing row instead of
// erroring, since from the admin's point of view that's not a failure.
const createSupplier = async (req, res) => {
  try {
    const { name, company_id, address, contact_number, categories } = req.body;
    if (!name || !name.trim()) return error(res, 'name is required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const existing = await pgrestGet('suppliers', {
      select: 'id,company_id,name,is_active',
      company_id: `eq.${targetCompanyId}`,
      name: `ilike.${name.trim()}`,
    });
    if (existing?.[0]) {
      if (!existing[0].is_active) {
        const reactivated = await pgrestPatch('suppliers', { id: `eq.${existing[0].id}` }, { is_active: true });
        return success(res, reactivated?.[0], 'Supplier reactivated', 201);
      }
      return success(res, existing[0], 'Supplier already exists');
    }

    const baseRow = { company_id: targetCompanyId, name: name.trim(), is_active: true };
    let data;
    try {
      [data] = await pgrestPost('suppliers', {
        ...baseRow,
        address: address || null,
        contact_number: contact_number || null,
        categories: Array.isArray(categories) ? categories : [],
      });
    } catch (e) {
      [data] = await pgrestPost('suppliers', baseRow);
    }
    return success(res, data, 'Supplier added', 201);
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/suppliers/:id — edit name/address/contact_number/categories.
const updateSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, categories } = req.body;
    if (name !== undefined && !name.trim()) return error(res, 'name cannot be empty', 400);

    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const body = {};
    if (name !== undefined) body.name = name.trim();
    if (address !== undefined) body.address = address || null;
    if (contact_number !== undefined) body.contact_number = contact_number || null;
    if (categories !== undefined) body.categories = Array.isArray(categories) ? categories : [];

    const data = await pgrestPatch('suppliers', filter, body);
    if (!data?.[0]) return error(res, 'Supplier not found', 404);
    return success(res, data[0], 'Supplier updated');
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/suppliers/:id — soft delete, same convention as
// salesmen/drivers/customers.
const deleteSupplier = async (req, res) => {
  try {
    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;
    const data = await pgrestPatch('suppliers', filter, { is_active: false });
    if (!data?.[0]) return error(res, 'Supplier not found', 404);
    return success(res, { deleted: true }, 'Supplier removed');
  } catch (err) { return error(res, err.message); }
};

// Shared by the purchase endpoint — finds a supplier by name (case
// insensitive) for this company, creating it if it doesn't exist yet, so
// a freely-typed new supplier name lands in the list automatically.
async function findOrCreateSupplier(companyId, name) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  const existing = await pgrestGet('suppliers', {
    select: 'id,name',
    company_id: `eq.${companyId}`,
    name: `ilike.${trimmed}`,
  });
  if (existing?.[0]) return existing[0];

  const [created] = await pgrestPost('suppliers', {
    company_id: companyId,
    name: trimmed,
    is_active: true,
  });
  return created;
}

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier, findOrCreateSupplier, getSupplierLedger, adjustSupplierLedger, deleteSupplierLedgerEntry, updateSupplierLedgerEntry };
