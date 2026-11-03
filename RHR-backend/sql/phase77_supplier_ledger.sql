-- Phase 77: supplier ledger entries table
-- Mirrors ledger_entries (customer) — one row per debit/credit transaction
-- against a supplier account, with a running_balance column so the current
-- payable/receivable can be read from the latest row without summing all rows.

CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  supplier_id      uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  entry_type       text NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount           numeric(14,2) NOT NULL CHECK (amount > 0),
  running_balance  numeric(14,2) NOT NULL DEFAULT 0,
  description      text,
  reference_type   text,
  created_at       timestamptz DEFAULT now(),
  created_by       uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS supplier_ledger_entries_supplier_id_idx ON supplier_ledger_entries(supplier_id);
CREATE INDEX IF NOT EXISTS supplier_ledger_entries_company_id_idx  ON supplier_ledger_entries(company_id);
CREATE INDEX IF NOT EXISTS supplier_ledger_entries_created_at_idx  ON supplier_ledger_entries(created_at DESC);
