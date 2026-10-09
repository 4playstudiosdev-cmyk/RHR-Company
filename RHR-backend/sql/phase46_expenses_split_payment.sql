-- A "Raw Material Purchase" expense paid partly cash, partly online
-- (e.g. 50/50) is ONE expense row with method='split' — not two separate
-- rows — carrying both portions so Bank → Transactions can still show
-- just the bank_amount portion as a real bank movement.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12,2);
