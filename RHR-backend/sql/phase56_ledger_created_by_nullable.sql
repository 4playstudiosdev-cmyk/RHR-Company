-- The new salesman self-service Cash Collection flow
-- (POST /api/v1/recovery/transactions/me) credits the customer's
-- ledger automatically with no human admin involved — created_by was
-- NOT NULL and only accepts a `users(id)` row (the admin table), which
-- a salesman's own id (lives in the separate `salesmen` table) can
-- never satisfy. Confirmed by reproducing the exact insert directly
-- against production and hitting a 23502 not-null violation.
ALTER TABLE ledger_entries ALTER COLUMN created_by DROP NOT NULL;
