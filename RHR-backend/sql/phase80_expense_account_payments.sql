-- ═══════════════════════════════════════════════════════════════
-- Phase 80 — opening balance + payment tracking for expense accounts.
--
-- expense_accounts gains an opening_balance column (how much the company
-- already owes this person / shop when the account is created).
-- expense_account_payments records each time admin pays the person back.
-- Together these drive the running-balance ledger in Company Expenses → By Person.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE expense_accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS expense_account_payments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_account_id  UUID         NOT NULL REFERENCES expense_accounts(id) ON DELETE CASCADE,
  company_id          UUID         NOT NULL REFERENCES companies(id),
  amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes               TEXT,
  payment_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE expense_account_payments ENABLE ROW LEVEL SECURITY;
