-- Expenses need a cash/bank split, same as Recovery payments already
-- have (payments.bank_account_id from phase18) — lets an admin record
-- which account an expense was actually paid from.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS method VARCHAR(10) NOT NULL DEFAULT 'cash';

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS bank_account_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_bank_account'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT fk_expenses_bank_account
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
  END IF;
END $$;
