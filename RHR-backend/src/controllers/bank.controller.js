const { success, error } = require('../utils/response');
const { resolveCompanyId } = require('../utils/companyScope');
const { pgrestGet, pgrestGetRaw, pgrestPost, pgrestPatch, pgrestDelete } = require('../utils/directQuery');

// ─── "Direct Transfer" pass-through accounts ────────────────────────────────
// Money in a Direct Transfer account went from a customer straight to a vendor:
// it comes IN and goes OUT at once and never sits with us, so the account
// always nets to zero. Only one side of each movement is stored, so the other
// side is added here:
//   • Vendor Payment expense (OUT)  → matching IN line just before it
//   • Bank transfer received (IN)   → matching OUT line just after it
//   • Cheque cleared (IN)           → matching OUT line just after it
// A vendor payment made by cheque #N and cheque #N cleared into the same
// account are already the two sides of one movement — neither is mirrored.
const isDirectTransferAccount = (a) => !!a && /direct\s*transfer/i.test(`${a.account_name || ''} ${a.bank_name || ''}`);
const chequeNoFrom = (text) => (String(text || '').match(/cheque\s*#\s*([A-Za-z0-9-]+)/i) || [])[1] || null;
const expenseBankAmount = (e) => (e.method === 'split' ? Number(e.bank_amount || 0) : Number(e.amount || 0));
const directInDescription = (e) => `Direct Transfer In — ${e.description || 'vendor payment'}`;
const directOutDescription = (src) => `Direct Transfer Out — paid on to vendor (${src})`;

// → { inForExpense, outForTransfer, outForCheque }: Sets of source row ids to mirror
function directTransferMirrors({ transfers = [], cheques = [], expenses = [] }) {
  const vendorPays = (expenses || []).filter((e) => e.category === 'Vendor Payment');
  const clearedNos = new Set((cheques || []).map((c) => c.cheque_number).filter(Boolean).map(String));
  const paidNos = new Set(vendorPays.map((e) => chequeNoFrom(e.description)).filter(Boolean));
  return {
    inForExpense: new Set(vendorPays.filter((e) => {
      const no = chequeNoFrom(e.description);
      return !(no && clearedNos.has(no));
    }).map((e) => e.id)),
    outForTransfer: new Set((transfers || []).map((t) => t.id)),
    outForCheque: new Set((cheques || []).filter((c) => !(c.cheque_number && paidNos.has(String(c.cheque_number)))).map((c) => c.id)),
  };
}
const NO_MIRRORS = { inForExpense: new Set(), outForTransfer: new Set(), outForCheque: new Set() };

// GET /api/v1/bank/accounts?company_id=
const getBankAccounts = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const params = {
      select: 'id,company_id,account_name,account_number,bank_name,branch_name,is_active,opening_balance,opening_balance_date,created_at',
      is_active: 'eq.true',
      order: 'account_name.asc',
    };
    if (companyId) params.company_id = `eq.${companyId}`;

    const data = await pgrestGet('bank_accounts', params);
    return success(res, data);
  } catch (err) {
    // bank_accounts is a phase18 addition — read as empty rather than
    // breaking the Bank page before that migration has run.
    return success(res, []);
  }
};

// POST /api/v1/bank/accounts
const createBankAccount = async (req, res) => {
  try {
    const { account_name, account_number, bank_name, branch_name, company_id } = req.body;
    if (!account_name || !account_number || !bank_name)
      return error(res, 'account_name, account_number, bank_name are required', 400);

    const targetCompanyId = req.user.role === 'branch_admin'
      ? req.user.company_id
      : (company_id || req.user.company_id);

    const { opening_balance, opening_balance_date } = req.body;

    const [data] = await pgrestPost('bank_accounts', {
      company_id:            targetCompanyId,
      account_name,
      account_number,
      bank_name,
      branch_name:           branch_name || null,
      is_active:             true,
      opening_balance:       Number(opening_balance) || 0,
      opening_balance_date:  opening_balance_date || null,
    });

    return success(res, data, 'Bank account added', 201);
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/transactions?from=&to=&company_id= — every bank-method
// movement on a bank account, both directions: money IN (approved
// customer payments / salesman recoveries collected via bank transfer —
// Feature 7's Recovery form, written through /payments) and money OUT
// (expenses paid from a bank account, written through /expenses). Each
// row carries a `type` of 'payment' or 'expense' so the UI can tell them
// apart — this is a read-only view over those two tables, not a
// separate ledger.
// Cash payments (method='cash') are included and tagged under the
// "Cash in Hand" virtual account so the Bank page can show a cash total.
const getBankTransactions = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const { from, to } = req.query;

    // ── Bank-transfer payments (bank_account_id set) ──
    const paymentParts = [
      'select=id,amount,method,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name),bank_accounts(account_name,bank_name,account_number)',
      'bank_account_id=not.is.null',
      'status=eq.approved',
      'order=created_at.desc',
    ];
    if (companyId) paymentParts.push(`company_id=eq.${companyId}`);
    if (from) paymentParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   paymentParts.push(`created_at=lte.${to}T23:59:59`);

    let payments = [];
    try {
      payments = await pgrestGetRaw(`payments?${paymentParts.join('&')}`);
    } catch (e) { /* bank_account_id is a phase18 addition */ }

    // ── Cash payments (no bank_account_id) — tagged as "Cash in Hand" ──
    // (old-style `payments` table entries — most cash now goes through salesman_recoveries)
    const cashParts = [
      'select=id,amount,method,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'bank_account_id=is.null',
      'method=eq.cash',
      'status=eq.approved',
      'order=created_at.desc',
    ];
    if (companyId) cashParts.push(`company_id=eq.${companyId}`);
    if (from) cashParts.push(`created_at=gte.${from}T00:00:00`);
    if (to)   cashParts.push(`created_at=lte.${to}T23:59:59`);

    let cashPayments = [];
    try {
      const raw = await pgrestGetRaw(`payments?${cashParts.join('&')}`);
      cashPayments = (raw || []).map((p) => ({
        ...p,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cash recoveries by salesmen — shown in transactions but NOT tagged as Cash in Hand ──
    // This cash is still with the salesman (not in the office). It enters Cash in Hand only
    // after a cash closing with deposit_to='petty_cash' is approved.
    // We still include them so they appear in the transactions list (useful reference),
    // but tagged with account_name='In Transit' so they don't inflate Cash in Hand balance.
    const recoveryParts = [
      'select=id,amount,recovery_date,created_at,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'payment_type=eq.cash',
      'status=eq.approved',
      'order=recovery_date.desc',
    ];
    if (companyId) recoveryParts.push(`company_id=eq.${companyId}`);
    if (from) recoveryParts.push(`recovery_date=gte.${from}`);
    if (to)   recoveryParts.push(`recovery_date=lte.${to}`);

    let cashRecoveries = [];
    try {
      const raw = await pgrestGetRaw(`salesman_recoveries?${recoveryParts.join('&')}`);
      cashRecoveries = (raw || []).map((r) => ({
        ...r,
        method: 'cash',
        created_at: r.recovery_date || r.created_at,
        bank_accounts: { account_name: 'In Transit', bank_name: 'Cash Recovery', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cash closings (approved petty cash deposits) — Cash in Hand IN ──
    // When a salesman comes to the office and deposits cash to the petty cash counter,
    // that is when it physically enters Cash in Hand. deposit_to='bank' goes directly
    // to the specific bank and is NOT tagged as Cash in Hand.
    const closingParts = [
      'select=id,amount,deposit_to,bank_account,closing_date,created_at,salesmen(full_name)',
      'status=eq.approved',
      'order=closing_date.desc',
    ];
    if (companyId) closingParts.push(`company_id=eq.${companyId}`);
    if (from) closingParts.push(`closing_date=gte.${from}`);
    if (to)   closingParts.push(`closing_date=lte.${to}`);

    let cashClosings = [];
    try {
      const raw = await pgrestGetRaw(`salesman_cash_closings?${closingParts.join('&')}`);
      cashClosings = (raw || []).map((c) => ({
        ...c,
        // petty_cash closings come INTO Cash in Hand (payment/IN)
        // bank closings go into the bank directly — also shown here as reference
        type: c.deposit_to === 'petty_cash' ? 'payment' : 'cash_deposit',
        method: 'cash',
        created_at: c.closing_date || c.created_at,
        category: 'Cash Deposit',
        description: `${c.salesmen?.full_name || 'Salesman'} deposited to ${c.deposit_to === 'bank' ? `bank${c.bank_account ? ` (${c.bank_account})` : ''}` : 'petty cash (office)'}`,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cash expenses (method=cash, no bank_account) — Cash in Hand OUT ──
    const cashExpParts = [
      'select=id,amount,category,description,expense_date',
      'method=eq.cash',
      'bank_account_id=is.null',
      'order=expense_date.desc',
    ];
    if (companyId) cashExpParts.push(`company_id=eq.${companyId}`);
    if (from) cashExpParts.push(`expense_date=gte.${from}`);
    if (to)   cashExpParts.push(`expense_date=lte.${to}`);

    let cashExpenses = [];
    try {
      const raw = await pgrestGetRaw(`expenses?${cashExpParts.join('&')}`);
      cashExpenses = (raw || []).map((e) => ({
        ...e,
        type: 'expense',
        method: 'cash',
        created_at: e.expense_date,
        bank_accounts: { account_name: 'Cash in Hand', bank_name: 'Cash', account_number: '' },
      }));
    } catch (e) { /* ignore */ }

    // ── Cheques cleared into a bank account (salesman_recoveries, phase72) ──
    let chequeIn = [];
    try {
      const chequeParts = [
        'select=id,amount,cleared_at,cheque_number,cheque_bank,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name),bank_accounts:bank_accounts!cleared_bank_account_id(account_name,bank_name,account_number)',
        'cleared_bank_account_id=not.is.null',
        'status=eq.approved',
      ];
      if (companyId) chequeParts.push(`company_id=eq.${companyId}`);
      if (from) chequeParts.push(`cleared_at=gte.${from}T00:00:00`);
      if (to)   chequeParts.push(`cleared_at=lte.${to}T23:59:59`);
      chequeIn = await pgrestGetRaw(`salesman_recoveries?${chequeParts.join('&')}`);
    } catch (e) { /* phase72 not run yet */ }

    // ── Expenses paid from a bank account (debit) ──
    const expenseParts = [
      'select=id,amount,method,category,description,expense_date,bank_account_id,bank_accounts(account_name,bank_name,account_number),cash_amount,bank_amount',
      'bank_account_id=not.is.null',
      'order=expense_date.desc',
    ];
    if (companyId) expenseParts.push(`company_id=eq.${companyId}`);
    if (from) expenseParts.push(`expense_date=gte.${from}`);
    if (to)   expenseParts.push(`expense_date=lte.${to}`);

    let expenses = [];
    try {
      expenses = await pgrestGetRaw(`expenses?${expenseParts.join('&')}`);
    } catch (e) {
      try {
        expenses = await pgrestGetRaw(`expenses?${expenseParts.join('&').replace(',cash_amount,bank_amount', '')}`);
      } catch (e2) { /* bank_account_id is a phase24 addition */ }
    }

    // ── Bank-account ID→info map (for bank transfers below) ──
    let accountMap = {};
    try {
      const accts = await pgrestGetRaw(
        `bank_accounts?select=id,account_name,bank_name,account_number${companyId ? `&company_id=eq.${companyId}` : ''}`
      );
      (accts || []).forEach(a => {
        accountMap[a.id] = { account_name: a.account_name, bank_name: a.bank_name, account_number: a.account_number };
      });
    } catch (e) { /* ignore */ }

    // ── Bank-transfer recoveries routed to a specific account (reference_number = account UUID) ──
    // These are the primary way salesmen record payments received via bank transfer.
    // They were missing from the transactions list, causing wrong balances in the accounts table.
    const btParts = [
      'select=id,amount,recovery_date,created_at,notes,reference_number,customer:users!customer_id(full_name),salesman:salesmen!salesman_id(full_name)',
      'payment_method=eq.bank_transfer',
      'status=eq.approved',
      'reference_number=not.is.null',
      'order=recovery_date.desc',
    ];
    if (companyId) btParts.push(`company_id=eq.${companyId}`);
    if (from) btParts.push(`recovery_date=gte.${from}`);
    if (to)   btParts.push(`recovery_date=lte.${to}`);

    let bankTransferRecoveries = [];
    try {
      const raw = await pgrestGetRaw(`salesman_recoveries?${btParts.join('&')}`);
      bankTransferRecoveries = (raw || [])
        .filter(r => accountMap[r.reference_number])
        .map(r => ({
          ...r,
          type: 'payment',
          method: 'bank_transfer',
          created_at: r.recovery_date || r.created_at,
          bank_accounts: accountMap[r.reference_number],
        }));
    } catch (e) { /* ignore */ }

    // Direct Transfer accounts: add the missing side of every movement (see top
    // of file). Pairing is worked out on the account's full history, then the
    // added lines are kept only if they fall inside the requested date range.
    const directLines = [];
    const inRange = (d) => {
      const day = String(d || '').slice(0, 10);
      return (!from || day >= from) && (!to || day <= to);
    };
    for (const id of Object.keys(accountMap).filter(aid => isDirectTransferAccount(accountMap[aid]))) {
      const acct = accountMap[id];
      const [dTransfers, dCheques, dExpenses] = await Promise.all([
        pgrestGetRaw(`salesman_recoveries?select=id,amount,recovery_date,created_at,customer:users!customer_id(full_name,shop_name)&payment_method=eq.bank_transfer&status=eq.approved&reference_number=eq.${id}`).catch(() => []),
        pgrestGetRaw(`salesman_recoveries?select=id,amount,cleared_at,cheque_number,customer:users!customer_id(full_name,shop_name)&cleared_bank_account_id=eq.${id}&status=eq.approved`).catch(() => []),
        pgrestGetRaw(`expenses?select=id,amount,expense_date,category,description,method,bank_amount&bank_account_id=eq.${id}`).catch(() => []),
      ]);
      const m = directTransferMirrors({ transfers: dTransfers, cheques: dCheques, expenses: dExpenses });
      for (const e of (dExpenses || [])) {
        if (!m.inForExpense.has(e.id) || !inRange(e.expense_date)) continue;
        directLines.push({ id: `din-${e.id}`, type: 'payment', method: 'direct_transfer', amount: expenseBankAmount(e),
          created_at: e.expense_date, customer: { full_name: directInDescription(e) }, bank_accounts: acct });
      }
      for (const t of (dTransfers || [])) {
        const date = t.recovery_date || t.created_at;
        if (!m.outForTransfer.has(t.id) || !inRange(date)) continue;
        directLines.push({ id: `dout-${t.id}`, type: 'expense', category: 'Direct Transfer Out', amount: Number(t.amount || 0),
          description: directOutDescription(`bank transfer from ${t.customer?.shop_name || t.customer?.full_name || 'customer'}`),
          created_at: date, bank_accounts: acct });
      }
      for (const c of (dCheques || [])) {
        if (!m.outForCheque.has(c.id) || !inRange(c.cleared_at)) continue;
        directLines.push({ id: `dout-${c.id}`, type: 'expense', category: 'Direct Transfer Out', amount: Number(c.amount || 0),
          description: directOutDescription(`cheque${c.cheque_number ? ` #${c.cheque_number}` : ''} from ${c.customer?.shop_name || c.customer?.full_name || 'customer'}`),
          created_at: c.cleared_at, bank_accounts: acct });
      }
    }

    const merged = [
      ...directLines,
      ...(payments    || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashPayments || []).map((p) => ({ ...p, type: 'payment' })),
      ...(cashRecoveries || []).map((r) => ({ ...r, type: 'payment' })),
      ...(chequeIn   || []).map((c) => ({ ...c, type: 'payment', method: 'cheque', created_at: c.cleared_at })),
      ...bankTransferRecoveries,
      ...(expenses   || []).map((e) => ({
        ...e,
        type: 'expense',
        amount: e.method === 'split' ? Number(e.bank_amount || 0) : e.amount,
        created_at: e.expense_date,
      })),
      ...(cashClosings || []),
      ...(cashExpenses || []),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return success(res, merged);
  } catch (err) {
    return success(res, []);
  }
};

// PATCH /api/v1/bank/accounts/:id
const updateBankAccount = async (req, res) => {
  try {
    const { account_name, account_number, bank_name, branch_name } = req.body;
    if (!account_name || !account_number || !bank_name)
      return error(res, 'account_name, account_number, bank_name are required', 400);

    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const rows = await pgrestPatch('bank_accounts', filter, {
      account_name,
      account_number,
      bank_name,
      branch_name: branch_name || null,
    });
    if (!rows?.[0]) return error(res, 'Account not found or access denied', 404);
    return success(res, rows[0], 'Account updated');
  } catch (err) { return error(res, err.message); }
};

// PATCH /api/v1/bank/accounts/:id/opening-balance
const updateOpeningBalance = async (req, res) => {
  try {
    const { opening_balance, opening_balance_date } = req.body;
    if (opening_balance === undefined || isNaN(Number(opening_balance)))
      return error(res, 'opening_balance must be a number', 400);

    const filter = { id: `eq.${req.params.id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const patch = { opening_balance: Number(opening_balance) };
    if (opening_balance_date) patch.opening_balance_date = opening_balance_date;

    const rows = await pgrestPatch('bank_accounts', filter, patch);
    if (!rows?.[0]) return error(res, 'Account not found or access denied', 404);
    return success(res, rows[0], 'Opening balance updated');
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/accounts/:id/ledger
// Full chronological ledger for one bank account.
//
// Cash in Hand account (bank_name='Cash'):
//   DEBIT  (IN) : salesman_cash_closings where deposit_to='petty_cash' — salesman
//                 physically brings cash to office and hands it to the cashier
//   CREDIT (OUT): expenses paid in cash (method=cash, no bank_account_id)
//   NOTE: cash collections/recoveries are NOT included — that cash is still
//   with the salesman and hasn't reached the office yet.
//
// Regular bank accounts:
//   DEBIT  (IN) : bank-transfer recoveries + cleared cheques
//   CREDIT (OUT): expenses paid from that account
const getBankLedger = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await pgrestGet('bank_accounts', {
      select: 'id,account_name,bank_name,account_number,opening_balance,opening_balance_date,company_id,created_at',
      id: `eq.${id}`,
    });
    const account = rows?.[0];
    if (!account) return error(res, 'Bank account not found', 404);
    if (req.user.role !== 'super_admin' && account.company_id !== req.user.company_id)
      return error(res, 'Access denied', 403);

    const isCashInHand = account.bank_name === 'Cash' || account.account_name?.toLowerCase().includes('cash in hand');
    const cid = account.company_id;

    const [transfers, cheques, expenses] = await Promise.all([
      // Bank-transfer recoveries routed to this account (reference_number = account UUID)
      pgrestGetRaw(
        `salesman_recoveries?select=id,amount,recovery_date,created_at,notes,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&payment_method=eq.bank_transfer&status=eq.approved&reference_number=eq.${id}`
      ).catch(() => []),

      // Cheques cleared into this account
      pgrestGetRaw(
        `salesman_recoveries?select=id,amount,cleared_at,cheque_number,cheque_bank,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&cleared_bank_account_id=eq.${id}&status=eq.approved`
      ).catch(() => []),

      // Expenses paid from this account
      pgrestGetRaw(
        `expenses?select=id,amount,expense_date,category,description,method,bank_amount&bank_account_id=eq.${id}`
      ).catch(() => []),
    ]);

    // Cash in Hand: petty cash closings (IN) + cash expenses (OUT)
    // Cash recoveries are NOT included — they are still with the salesman.
    let pettyCashClosings = [], cashExpenses = [];
    if (isCashInHand) {
      [pettyCashClosings, cashExpenses] = await Promise.all([
        pgrestGetRaw(
          `salesman_cash_closings?select=id,amount,closing_date,notes,salesmen(full_name)&deposit_to=eq.petty_cash&status=eq.approved&company_id=eq.${cid}&order=closing_date.asc`
        ).catch(() => []),

        pgrestGetRaw(
          `expenses?select=id,amount,expense_date,category,description&method=eq.cash&bank_account_id=is.null&company_id=eq.${cid}&order=expense_date.asc`
        ).catch(() => []),
      ]);
    }

    const entries = [];

    // Opening balance (always shown as first entry)
    const openingBal = Number(account.opening_balance || 0);
    entries.push({
      id: 'opening',
      date: account.opening_balance_date || account.created_at,
      type: 'opening',
      description: 'Opening Balance',
      debit: openingBal,
      credit: 0,
    });

    const mirrors = isDirectTransferAccount(account)
      ? directTransferMirrors({ transfers, cheques, expenses })
      : NO_MIRRORS;

    for (const r of (transfers || [])) {
      const name = r.customer?.shop_name || r.customer?.full_name || '—';
      const note = r.notes ? r.notes.replace(/Bank:\s*[^·]+·?\s*/i, '').trim() : '';
      const date = r.recovery_date || r.created_at;
      entries.push({
        id: r.id,
        date,
        type: 'transfer_in',
        description: `Bank Transfer — ${name}${note ? ` (${note})` : ''}${r.salesman?.full_name ? ` via ${r.salesman.full_name}` : ''}`,
        debit: Number(r.amount || 0),
        credit: 0,
      });
      if (mirrors.outForTransfer.has(r.id)) {
        entries.push({ id: `dout-${r.id}`, date, type: 'direct_out',
          description: directOutDescription(`bank transfer from ${name}`),
          debit: 0, credit: Number(r.amount || 0) });
      }
    }

    for (const c of (cheques || [])) {
      const name = c.customer?.shop_name || c.customer?.full_name || '—';
      entries.push({
        id: c.id,
        date: c.cleared_at,
        type: 'cheque_in',
        description: `Cheque Cleared — ${name}${c.cheque_number ? ` #${c.cheque_number}` : ''}${c.cheque_bank ? ` (${c.cheque_bank})` : ''}`,
        debit: Number(c.amount || 0),
        credit: 0,
      });
      if (mirrors.outForCheque.has(c.id)) {
        entries.push({ id: `dout-${c.id}`, date: c.cleared_at, type: 'direct_out',
          description: directOutDescription(`cheque${c.cheque_number ? ` #${c.cheque_number}` : ''} from ${name}`),
          debit: 0, credit: Number(c.amount || 0) });
      }
    }

    for (const e of (expenses || [])) {
      const amt = expenseBankAmount(e);
      if (mirrors.inForExpense.has(e.id)) {
        entries.push({
          id: `din-${e.id}`,
          date: e.expense_date,
          type: 'direct_in',
          description: directInDescription(e),
          debit: amt,
          credit: 0,
        });
      }
      entries.push({
        id: e.id,
        date: e.expense_date,
        type: 'expense',
        description: `${e.category || 'Expense'}${e.description ? ` — ${e.description}` : ''}`,
        debit: 0,
        credit: amt,
      });
    }

    // Cash in Hand only: petty cash closings (salesman gave cash to office) → DEBIT IN
    for (const c of (pettyCashClosings || [])) {
      entries.push({
        id: c.id,
        date: c.closing_date,
        type: 'petty_cash_in',
        description: `Petty Cash — ${c.salesmen?.full_name || 'Salesman'} deposited to office${c.notes ? ` · ${c.notes}` : ''}`,
        debit: Number(c.amount || 0),
        credit: 0,
      });
    }

    // Cash in Hand only: cash expenses (paid from office cash) → CREDIT OUT
    for (const e of (cashExpenses || [])) {
      entries.push({
        id: `cexp-${e.id}`,
        date: e.expense_date,
        type: 'expense',
        description: `${e.category || 'Expense'}${e.description ? ` — ${e.description}` : ''}`,
        debit: 0,
        credit: Number(e.amount || 0),
      });
    }

    // Sort ascending by date, opening always first
    entries.sort((a, b) => {
      if (a.type === 'opening') return -1;
      if (b.type === 'opening') return 1;
      return new Date(a.date) - new Date(b.date);
    });

    // Compute running balance
    let running = 0;
    for (const e of entries) {
      running += e.debit - e.credit;
      e.balance = running;
    }

    return success(res, { account, entries });
  } catch (err) { return error(res, err.message); }
};

// GET /api/v1/bank/summary
// Lightweight all-time balance snapshot for the Dashboard widget:
// Cash in Hand = opening_balance of Cash account + petty cash closings (IN) − cash expenses (OUT).
// Cash recoveries are NOT counted — that cash is still with the salesman, not in the office.
// Per-bank balance = opening + bank transfers in + cheques cleared in − bank expenses out.
const getBankSummary = async (req, res) => {
  try {
    const companyId = resolveCompanyId(req);
    const cf = companyId ? `&company_id=eq.${companyId}` : '';
    const cfObj = companyId ? { company_id: `eq.${companyId}` } : {};

    const [accounts, pettyCashClose, cashExp, allTransfers, allCheques, allBankExp] = await Promise.all([
      pgrestGet('bank_accounts', {
        select: 'id,account_name,bank_name,account_number,opening_balance',
        is_active: 'eq.true',
        ...cfObj,
        order: 'account_name.asc',
      }).catch(() => []),

      // Petty cash closings only (salesman delivered cash to office) — Cash in Hand IN
      pgrestGet('salesman_cash_closings', {
        select: 'amount',
        deposit_to: 'eq.petty_cash',
        status: 'eq.approved',
        ...cfObj,
      }).catch(() => []),

      // Cash expenses (paid in cash, not from a bank account) — Cash in Hand OUT
      pgrestGet('expenses', {
        select: 'amount',
        method: 'eq.cash',
        bank_account_id: 'is.null',
        ...cfObj,
      }).catch(() => []),

      pgrestGet('salesman_recoveries', {
        select: 'id,amount,reference_number',
        payment_method: 'eq.bank_transfer',
        status: 'eq.approved',
        reference_number: 'not.is.null',
        ...cfObj,
      }).catch(() => []),

      pgrestGetRaw(
        `salesman_recoveries?select=id,amount,cleared_bank_account_id,cheque_number&cleared_bank_account_id=not.is.null&status=eq.approved${cf}`
      ).catch(() => []),

      pgrestGet('expenses', {
        select: 'id,amount,bank_account_id,method,bank_amount,category,description',
        bank_account_id: 'not.is.null',
        ...cfObj,
      }).catch(() => []),
    ]);

    const inMap = {};
    (allTransfers || []).forEach(r => {
      const id = r.reference_number;
      if (id) inMap[id] = (inMap[id] || 0) + Number(r.amount || 0);
    });
    (allCheques || []).forEach(r => {
      const id = r.cleared_bank_account_id;
      if (id) inMap[id] = (inMap[id] || 0) + Number(r.amount || 0);
    });
    const outMap = {};
    (allBankExp || []).forEach(e => {
      const id = e.bank_account_id;
      const amt = expenseBankAmount(e);
      if (id) outMap[id] = (outMap[id] || 0) + amt;
    });

    // Direct Transfer accounts: add the missing side of every movement (see top of file)
    for (const acct of (accounts || []).filter(isDirectTransferAccount)) {
      const id = acct.id;
      const transfers = (allTransfers || []).filter(r => r.reference_number === id);
      const cheques = (allCheques || []).filter(c => c.cleared_bank_account_id === id);
      const expenses = (allBankExp || []).filter(e => e.bank_account_id === id);
      const m = directTransferMirrors({ transfers, cheques, expenses });
      expenses.forEach(e => { if (m.inForExpense.has(e.id)) inMap[id] = (inMap[id] || 0) + expenseBankAmount(e); });
      transfers.forEach(r => { if (m.outForTransfer.has(r.id)) outMap[id] = (outMap[id] || 0) + Number(r.amount || 0); });
      cheques.forEach(c => { if (m.outForCheque.has(c.id)) outMap[id] = (outMap[id] || 0) + Number(c.amount || 0); });
    }

    const cashAccount = (accounts || []).find(a => a.bank_name === 'Cash' || a.account_name?.toLowerCase().includes('cash in hand'));
    const cashOpening = Number(cashAccount?.opening_balance || 0);
    const cashIn  = (pettyCashClose || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const cashOut = (cashExp        || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const cashInHand = cashOpening + cashIn - cashOut
      + (cashAccount ? (inMap[cashAccount.id] || 0) : 0)
      - (cashAccount ? (outMap[cashAccount.id] || 0) : 0);

    const accountsWithBalance = (accounts || []).map(a => ({
      id: a.id,
      account_name: a.account_name,
      bank_name: a.bank_name,
      account_number: a.account_number,
      current_balance: (a.bank_name === 'Cash' || a.account_name?.toLowerCase().includes('cash in hand'))
        ? cashInHand
        : Number(a.opening_balance || 0) + (inMap[a.id] || 0) - (outMap[a.id] || 0),
    }));

    const totalBank = accountsWithBalance.reduce((s, a) => s + a.current_balance, 0);

    return success(res, {
      cash_in_hand: cashInHand,
      accounts: accountsWithBalance,
      total_bank: totalBank,
      grand_total: cashInHand + totalBank,
    });
  } catch (err) { return error(res, err.message); }
};

const CITY_NAMES = {
  '1e5962c6-33a7-460b-913e-9e08db46973a': 'Karachi',
  '09a1fda3-7ac0-406a-8f42-75d973dc3b7e': 'Hyderabad',
  '00f79d89-0d36-4704-8865-fc7bbd662267': 'Sukkur',
};

// GET /api/v1/bank/merged-ledger?bank_name=Meezan+Bank[&company_id=]
// Merges ledger entries from ALL accounts sharing the same bank_name across
// all cities (or one city when company_id is given). Each entry carries a
// `branch` field so the UI can show which city it came from.
const getMergedBankLedger = async (req, res) => {
  try {
    const { bank_name } = req.query;
    if (!bank_name) return error(res, 'bank_name is required', 400);

    const companyId = resolveCompanyId(req);
    const acctParams = {
      select: 'id,account_name,bank_name,account_number,opening_balance,opening_balance_date,company_id,created_at',
      is_active: 'eq.true',
      bank_name: `ilike.${bank_name}`,
    };
    if (companyId) acctParams.company_id = `eq.${companyId}`;

    const accounts = await pgrestGet('bank_accounts', acctParams);
    if (!accounts?.length) return success(res, { accounts: [], entries: [], total_balance: 0 });

    if (req.user.role !== 'super_admin') {
      const allowed = accounts.filter(a => a.company_id === req.user.company_id);
      if (!allowed.length) return error(res, 'Access denied', 403);
    }

    const allEntries = [];

    for (const account of accounts) {
      const branch = CITY_NAMES[account.company_id] || 'Unknown';
      const isCashInHand = account.bank_name === 'Cash' || account.account_name?.toLowerCase().includes('cash in hand');
      const cid = account.company_id;

      const [transfers, cheques, expenses] = await Promise.all([
        pgrestGetRaw(
          `salesman_recoveries?select=id,amount,recovery_date,created_at,notes,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&payment_method=eq.bank_transfer&status=eq.approved&reference_number=eq.${account.id}`
        ).catch(() => []),
        pgrestGetRaw(
          `salesman_recoveries?select=id,amount,cleared_at,cheque_number,cheque_bank,customer:users!customer_id(full_name,shop_name),salesman:salesmen!salesman_id(full_name)&cleared_bank_account_id=eq.${account.id}&status=eq.approved`
        ).catch(() => []),
        pgrestGetRaw(
          `expenses?select=id,amount,expense_date,category,description,method,bank_amount&bank_account_id=eq.${account.id}`
        ).catch(() => []),
      ]);

      let pettyCashClosings = [], cashExpenses = [];
      if (isCashInHand) {
        [pettyCashClosings, cashExpenses] = await Promise.all([
          pgrestGetRaw(`salesman_cash_closings?select=id,amount,closing_date,notes,salesmen(full_name)&deposit_to=eq.petty_cash&status=eq.approved&company_id=eq.${cid}&order=closing_date.asc`).catch(() => []),
          pgrestGetRaw(`expenses?select=id,amount,expense_date,category,description&method=eq.cash&bank_account_id=is.null&company_id=eq.${cid}&order=expense_date.asc`).catch(() => []),
        ]);
      }

      // Opening balance row
      const openingBal = Number(account.opening_balance || 0);
      allEntries.push({
        id: `opening-${account.id}`,
        date: account.opening_balance_date || account.created_at,
        type: 'opening',
        description: `Opening Balance — ${account.account_name}`,
        debit: openingBal > 0 ? openingBal : 0,
        credit: openingBal < 0 ? Math.abs(openingBal) : 0,
        branch,
        account_name: account.account_name,
      });

      const mirrors = isDirectTransferAccount(account)
        ? directTransferMirrors({ transfers, cheques, expenses })
        : NO_MIRRORS;
      for (const r of (transfers || [])) {
        const name = r.customer?.shop_name || r.customer?.full_name || '—';
        const note = r.notes ? r.notes.replace(/Bank:\s*[^·]+·?\s*/i, '').trim() : '';
        const date = r.recovery_date || r.created_at;
        allEntries.push({ id: r.id, date, type: 'transfer_in',
          description: `Bank Transfer — ${name}${note ? ` (${note})` : ''}${r.salesman?.full_name ? ` via ${r.salesman.full_name}` : ''}`,
          debit: Number(r.amount || 0), credit: 0, branch, account_name: account.account_name });
        if (mirrors.outForTransfer.has(r.id)) {
          allEntries.push({ id: `dout-${r.id}`, date, type: 'direct_out',
            description: directOutDescription(`bank transfer from ${name}`),
            debit: 0, credit: Number(r.amount || 0), branch, account_name: account.account_name });
        }
      }
      for (const c of (cheques || [])) {
        const name = c.customer?.shop_name || c.customer?.full_name || '—';
        allEntries.push({ id: c.id, date: c.cleared_at, type: 'cheque_in',
          description: `Cheque Cleared — ${name}${c.cheque_number ? ` #${c.cheque_number}` : ''}`,
          debit: Number(c.amount || 0), credit: 0, branch, account_name: account.account_name });
        if (mirrors.outForCheque.has(c.id)) {
          allEntries.push({ id: `dout-${c.id}`, date: c.cleared_at, type: 'direct_out',
            description: directOutDescription(`cheque${c.cheque_number ? ` #${c.cheque_number}` : ''} from ${name}`),
            debit: 0, credit: Number(c.amount || 0), branch, account_name: account.account_name });
        }
      }
      for (const e of (expenses || [])) {
        const amt = expenseBankAmount(e);
        if (mirrors.inForExpense.has(e.id)) {
          allEntries.push({ id: `din-${e.id}`, date: e.expense_date, type: 'direct_in',
            description: directInDescription(e),
            debit: amt, credit: 0, branch, account_name: account.account_name });
        }
        allEntries.push({ id: e.id, date: e.expense_date, type: 'expense',
          description: `${e.category || 'Expense'}${e.description ? ` — ${e.description}` : ''}`,
          debit: 0, credit: amt, branch, account_name: account.account_name });
      }
      for (const c of (pettyCashClosings || [])) {
        allEntries.push({ id: c.id, date: c.closing_date, type: 'petty_cash_in',
          description: `Petty Cash — ${c.salesmen?.full_name || 'Salesman'} deposited${c.notes ? ` · ${c.notes}` : ''}`,
          debit: Number(c.amount || 0), credit: 0, branch, account_name: account.account_name });
      }
      for (const e of (cashExpenses || [])) {
        allEntries.push({ id: `cexp-${e.id}`, date: e.expense_date, type: 'expense',
          description: `${e.category || 'Expense'}${e.description ? ` — ${e.description}` : ''}`,
          debit: 0, credit: Number(e.amount || 0), branch, account_name: account.account_name });
      }
    }

    // Sort: opening entries first (by date), then rest by date ascending
    allEntries.sort((a, b) => {
      if (a.type === 'opening' && b.type !== 'opening') return -1;
      if (b.type === 'opening' && a.type !== 'opening') return 1;
      return new Date(a.date) - new Date(b.date);
    });

    let running = 0;
    for (const e of allEntries) {
      running += e.debit - e.credit;
      e.balance = running;
    }

    return success(res, { accounts, entries: allEntries, total_balance: running });
  } catch (err) { return error(res, err.message); }
};

// DELETE /api/v1/bank/accounts/:id — hard-deletes the account and all linked transactions
const deleteBankAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { id: `eq.${id}` };
    if (req.user.role !== 'super_admin') filter.company_id = `eq.${req.user.company_id}`;

    const rows = await pgrestGet('bank_accounts', { ...filter, select: 'id,account_name,company_id' });
    if (!rows?.[0]) return error(res, 'Bank account not found or access denied', 404);

    // Delete all linked data before removing the account itself
    // 1. Bank-transfer recoveries pointing to this account (reference_number stores account UUID)
    try { await pgrestDelete('salesman_recoveries', { reference_number: `eq.${id}` }); } catch (_) {}
    // 2. Cheques that were cleared into this account
    try { await pgrestDelete('salesman_recoveries', { cleared_bank_account_id: `eq.${id}` }); } catch (_) {}
    // 3. Expenses paid from this account
    try { await pgrestDelete('expenses', { bank_account_id: `eq.${id}` }); } catch (_) {}
    // 4. The account itself
    await pgrestDelete('bank_accounts', { id: `eq.${id}` });

    return success(res, { deleted: true }, 'Bank account and all linked transactions deleted');
  } catch (err) { return error(res, err.message); }
};

module.exports = { getBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount, getBankTransactions, updateOpeningBalance, getBankLedger, getMergedBankLedger, getBankSummary };
