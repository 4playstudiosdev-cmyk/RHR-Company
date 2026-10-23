-- ═══════════════════════════════════════════════════════════════
-- Phase 71 — expense accounts (people / shops the company spends on).
--
-- Company Expenses → Add Expense now has a "Person / Account" picker with three
-- groups: Drivers, Salesmen and these Expense Accounts (Kohinoor Oil, mechanics,
-- "Home expense" …). The expense is tied to that person, so Company Expenses →
-- By Person can show everything spent on them, month by month.
--
-- Run this in the Supabase SQL Editor BEFORE using the new picker for expense
-- accounts (drivers and salesmen work without it). Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expense_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        VARCHAR(200) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

ALTER TABLE expense_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES expense_accounts(id);

-- The starting list, added to every branch.
INSERT INTO expense_accounts (company_id, name)
SELECT c.id, n.name
FROM companies c
CROSS JOIN (VALUES
  ('Kohinoor Oil'),
  ('Rahoof Mechanic'),
  ('Iman Autos'),
  ('Imran Machine Repairing'),
  ('Imran Haper Repairing'),
  ('Home Expense'),
  ('Asif Bhai Expense'),
  ('Kashif Bhai Expense'),
  ('Sir Riaz Hussain Expense')
) AS n(name)
ON CONFLICT (company_id, name) DO NOTHING;
