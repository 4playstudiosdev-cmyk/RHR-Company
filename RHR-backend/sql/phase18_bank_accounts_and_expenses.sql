-- photo_url was NOT NULL — fine for the salesman mobile app (always has
-- a proof photo) but blocks an admin from recording a Recovery entry
-- directly at the office with no photo. Nullable now; the mobile flow
-- still requires one at the application level (payments.controller.js).
ALTER TABLE payments
  ALTER COLUMN photo_url DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- bank_accounts already existed in this database (unused by any code
-- until now) with this exact shape — this CREATE is a no-op here, kept
-- only so the file is a complete, accurate record of the schema.
CREATE TABLE IF NOT EXISTS bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  account_name   VARCHAR(200) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  bank_name      VARCHAR(200) NOT NULL,
  branch_name    VARCHAR(200),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts (company_id);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS — this checks pg_constraint
-- by hand so re-running the file doesn't fail with "constraint already exists".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_bank_account'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_bank_account
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
  END IF;
END $$;

ALTER TABLE raw_material_stock_logs
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);

ALTER TABLE raw_material_stock_logs
  ADD COLUMN IF NOT EXISTS purchase_id UUID;

ALTER TABLE raw_material_stock_logs
  ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC;

-- expenses already existed in this database too, with this exact shape
-- — also a no-op, kept for the same reason as bank_accounts above.
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  category      VARCHAR(100) NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  description   TEXT,
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses (company_id, expense_date DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
