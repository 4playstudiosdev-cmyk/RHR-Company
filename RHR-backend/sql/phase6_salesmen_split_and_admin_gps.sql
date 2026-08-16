-- ═══════════════════════════════════════════════════════════════
-- Phase 6 — split salesmen out of `users` into their own table,
-- and add admin GPS location tracking.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the backend
-- code that goes with it — the app code assumes this has already
-- run (queries `salesmen` directly, expects `orders.salesman_id`
-- etc. to point at it).
--
-- Safe to re-run: every step is guarded (IF NOT EXISTS / ON
-- CONFLICT DO NOTHING / dynamic constraint lookup by column name
-- rather than a hardcoded constraint name, since we don't know
-- what Supabase actually named these FKs).
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────
-- 0. Defensive: make sure fcm_token exists on users before we copy
--    it below, in case phase4 was never run in this environment.
-- ───────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;


-- ───────────────────────────────────────────────
-- 1. New salesmen table
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salesmen (
  id           UUID PRIMARY KEY,                          -- same id as the auth.users / former users row
  company_id   UUID NOT NULL REFERENCES companies(id),
  full_name    VARCHAR(200) NOT NULL,
  phone        VARCHAR(20) UNIQUE,
  email        VARCHAR(200) UNIQUE,
  position     VARCHAR(100),
  is_approved  BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  fcm_token    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE salesmen ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────
-- 2. Migrate existing salesman rows out of users (keeps the same
--    id, so existing JWTs and the underlying Supabase Auth user
--    stay valid — only the app-level profile table changes).
-- ───────────────────────────────────────────────
INSERT INTO salesmen (id, company_id, full_name, phone, email, position, is_approved, is_active, fcm_token, created_at)
SELECT id, company_id, full_name, phone, email, position,
       COALESCE(is_approved, true), COALESCE(is_active, true), fcm_token, created_at
FROM users
WHERE role = 'salesman'
ON CONFLICT (id) DO NOTHING;


-- ───────────────────────────────────────────────
-- 3. Helper: drop a foreign key constraint by (table, column)
--    without needing to know its actual name.
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _drop_fk_if_exists(p_table text, p_column text) RETURNS void AS $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND rel.relname = p_table AND att.attname = p_column
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p_table, con.conname);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ───────────────────────────────────────────────
-- 4. Columns that always mean "a salesman, specifically" — repoint
--    their FK from users(id) to salesmen(id).
-- ───────────────────────────────────────────────
SELECT _drop_fk_if_exists('orders', 'salesman_id');
ALTER TABLE orders ADD CONSTRAINT orders_salesman_id_fkey FOREIGN KEY (salesman_id) REFERENCES salesmen(id);

SELECT _drop_fk_if_exists('payments', 'salesman_id');
ALTER TABLE payments ADD CONSTRAINT payments_salesman_id_fkey FOREIGN KEY (salesman_id) REFERENCES salesmen(id);

SELECT _drop_fk_if_exists('customer_visits', 'salesman_id');
ALTER TABLE customer_visits ADD CONSTRAINT customer_visits_salesman_id_fkey FOREIGN KEY (salesman_id) REFERENCES salesmen(id);

-- users.salesman_id = the salesman assigned to a customer row
SELECT _drop_fk_if_exists('users', 'salesman_id');
ALTER TABLE users ADD CONSTRAINT users_salesman_id_fkey FOREIGN KEY (salesman_id) REFERENCES salesmen(id);


-- ───────────────────────────────────────────────
-- 5. Columns that can point at ANY staff member (salesman, delivery,
--    or admin) — Postgres has no polymorphic FK, so these just drop
--    their constraint and become plain UUID columns, validated at
--    the application layer instead.
-- ───────────────────────────────────────────────
SELECT _drop_fk_if_exists('gps_locations',    'user_id');
SELECT _drop_fk_if_exists('attendance',       'user_id');
SELECT _drop_fk_if_exists('leave_requests',   'user_id');
SELECT _drop_fk_if_exists('salary_structures','user_id');
SELECT _drop_fk_if_exists('notifications',    'recipient_id');

DROP FUNCTION _drop_fk_if_exists(text, text);


-- ───────────────────────────────────────────────
-- 6. Remove the now-migrated salesman rows from users. Their
--    Supabase Auth identity (auth.users) is untouched — only this
--    app-level profile table changes, so existing tokens still work.
-- ───────────────────────────────────────────────
DELETE FROM users WHERE role = 'salesman';


-- ───────────────────────────────────────────────
-- 7. Admin GPS location tracking (continuous, same shape as
--    gps_locations). Admins stay in `users`, so this gets a real FK.
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  accuracy     DOUBLE PRECISION,
  status       VARCHAR(20) DEFAULT 'active',
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_locations_user
  ON admin_locations (user_id, recorded_at DESC);

ALTER TABLE admin_locations ENABLE ROW LEVEL SECURITY;
