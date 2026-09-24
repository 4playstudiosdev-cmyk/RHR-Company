-- ═══════════════════════════════════════════════════════════════
-- Phase 27 — Salesman Recovery module: cash/online payment collection
-- entries plus end-of-day cash-in-hand closings, separate from the
-- existing payments table (which has no cash-in-hand/closing concept).
-- Run this in the Supabase SQL Editor before hitting the new
-- /api/v1/recovery/* endpoints. Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS salesman_recoveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  salesman_id       UUID NOT NULL REFERENCES salesmen(id),
  customer_id       UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(12,2) NOT NULL,
  payment_type      VARCHAR(10) NOT NULL,          -- 'cash' | 'online'
  payment_method    VARCHAR(30) NOT NULL DEFAULT 'cash', -- cash, easypaisa, jazzcash, bank_transfer
  reference_number  VARCHAR(100),
  notes             TEXT,
  status            VARCHAR(15) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  recovery_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salesman_recoveries_company  ON salesman_recoveries (company_id, status);
CREATE INDEX IF NOT EXISTS idx_salesman_recoveries_salesman ON salesman_recoveries (salesman_id, payment_type, status);

ALTER TABLE salesman_recoveries ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS salesman_cash_closings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  salesman_id   UUID NOT NULL REFERENCES salesmen(id),
  amount        NUMERIC(12,2) NOT NULL,
  deposit_to    VARCHAR(15) NOT NULL DEFAULT 'bank', -- 'bank' | 'petty_cash'
  bank_account  VARCHAR(200),
  notes         TEXT,
  status        VARCHAR(15) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  closing_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_closings_company  ON salesman_cash_closings (company_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_closings_salesman ON salesman_cash_closings (salesman_id, status);

ALTER TABLE salesman_cash_closings ENABLE ROW LEVEL SECURITY;
