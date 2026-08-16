-- ═══════════════════════════════════════════════════════════════
-- Phase 9 — simple employees directory.
--
-- This is deliberately separate from `salesmen`: salesmen are real
-- login accounts (Supabase Auth + email/password) used for the
-- mobile app, GPS tracking, and attendance check-in/out. `employees`
-- is a plain HR contact record — name/phone/email/address/city/salary
-- — with NO account, NO login, and NO auth.users row created. It's
-- for staff the admin just wants on file (e.g. office/admin roles),
-- managed entirely from the desktop app.
--
-- Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  full_name    VARCHAR(200) NOT NULL,
  phone        VARCHAR(20),
  email        VARCHAR(200),
  address      TEXT,
  city         VARCHAR(100),
  salary       NUMERIC(12,2),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_company ON employees (company_id);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
