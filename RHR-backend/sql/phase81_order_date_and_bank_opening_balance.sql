-- phase81: order_date (back-dating orders) + bank account opening balance

-- 1. Allow orders to carry a manually-set order date (back-dating).
--    Defaults to the existing created_at date so all old records are unaffected.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_date DATE;

UPDATE orders SET order_date = created_at::date WHERE order_date IS NULL;

-- 2. Bank account opening balance — lets admins set a starting balance and
--    start date so the Bank page reflects real-world balances from day one.
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_date DATE;
