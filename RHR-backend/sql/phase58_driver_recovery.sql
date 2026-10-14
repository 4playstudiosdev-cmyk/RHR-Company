-- Generalizes the existing salesman_recoveries/salesman_cash_closings
-- (phase27) to also support a driver collecting cash — salesman_id
-- becomes nullable and a parallel driver_id is added; exactly one of
-- the two is set per row (enforced in application code, not a CHECK
-- constraint, to keep this a plain additive migration).
ALTER TABLE salesman_recoveries ALTER COLUMN salesman_id DROP NOT NULL;
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

ALTER TABLE salesman_cash_closings ALTER COLUMN salesman_id DROP NOT NULL;
ALTER TABLE salesman_cash_closings ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

-- Driver Recovery (admin panel) — a plain log of cash a driver has
-- physically handed over to/received from a salesman. Deliberately NOT
-- tied to ledger_entries: the underlying customer payment was already
-- credited to the ledger when the salesman (or the driver, via
-- orders.amount_collected) originally collected it — this table only
-- tracks the internal cash custody handoff between the two of them, so
-- admin has a record of who is holding what, not a second money trail.
CREATE TABLE IF NOT EXISTS driver_cash_handoffs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  driver_id    UUID NOT NULL REFERENCES drivers(id),
  salesman_id  UUID REFERENCES salesmen(id),
  amount       NUMERIC(12,2) NOT NULL,
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_cash_handoffs_company ON driver_cash_handoffs (company_id);
CREATE INDEX IF NOT EXISTS idx_driver_cash_handoffs_driver  ON driver_cash_handoffs (driver_id);
