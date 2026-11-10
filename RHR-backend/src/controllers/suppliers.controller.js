const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

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
        order: 'created_at.desc',
      });
    } catch (e) {
      // Table doesn't exist yet — run phase77_supplier_ledger.sql
      return success(res, { entries: [], currentBalance: 0 });
    }
    const currentBalance = data?.length > 0 ? Number(data[0].running_balance) : 0;
    return success(res, { entries: data || [], currentBalance });
  } catch (err) { return error(res, err.message); }
};

// POST /api/v1/suppliers/:id/ledger/adjustment
const adjustSupplierLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { entry_type, amount, description, reference_type: refType, receipt_url, payment_method, payment_date } = req.body;
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

    // Create expense when admin records a payment to supplier
    if (entry_type === 'credit' && (refType || 'adjustment') === 'payment') {
      const expDate = payment_date || new Date().toISOString().split('T')[0];
      const expMethod = payment_method === 'bank' ? 'bank' : 'cash';
      try {
        await pgrestPost('expenses', {
          company_id:   supplier.company_id,
          category:     'Vendor Payment',
          amount:       Number(amount),
          description:  `Vendor payment to ${supplier.name || 'vendor'} — ${description}`,
          expense_date: expDate,
          method:       expMethod,
          supplier_id:  id,
          created_by:   req.user.id,
        });
      } catch (_) { /* non-fatal — expense columns may vary */ }
    }

    return success(res, data, 'Ledger entry added', 201);
  } catch (err) { return error(res, err.message); }
};

// Helper: recalculate running_balance for all entries (sorted asc by created_at)
async function recalcRunningBalances(entries) {
  let bal = 0;
  for (const e of entries) {
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

    // Delete linked expense if this was a payment credit
    if (entryToDelete?.entry_type === 'credit' && entryToDelete?.reference_type === 'payment') {
      try {
        const entryDate = (entryToDelete.created_at || '').split('T')[0];
        const linked = await pgrestGet('expenses', {
          supplier_id: `eq.${supplierId}`,
          amount: `eq.${Number(entryToDelete.amount)}`,
          category: `eq.Vendor Payment`,
          expense_date: `eq.${entryDate}`,
          order: 'created_at.desc',
          limit: '1',
        });
        if (linked?.[0]?.id) {
          await pgrestDelete('expenses', { id: `eq.${linked[0].id}` });
        }
      } catch (_) { /* non-fatal */ }
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
