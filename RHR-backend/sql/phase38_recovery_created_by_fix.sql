-- phase27_salesman_recovery.sql's CREATE TABLE IF NOT EXISTS already
-- defined created_by on both tables, but IF NOT EXISTS means a re-run
-- after the tables already existed (from an even earlier, column-less
-- version) never actually added it — confirmed live via a direct
-- PostgREST query: both tables were missing created_by entirely, which
-- is why every recovery/cash-closing save failed with "could not find
-- the 'created_by' column ... schema cache".
ALTER TABLE salesman_recoveries    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE salesman_cash_closings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
