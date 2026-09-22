-- Returns panel — three sub-types: packaging return and raw material
-- return both add stock back (material physically comes back to the
-- company — same direction as Raw Materials "+ Add Stock"; if this
-- should instead mean sending material back to a supplier, i.e.
-- decreasing stock, that's a one-line flip in returns.controller.js,
-- not a schema change). Order return doesn't touch raw material stock
-- at all — it only credits the customer's ledger.

CREATE TABLE IF NOT EXISTS material_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  return_type     VARCHAR(20) NOT NULL CHECK (return_type IN ('packaging', 'raw_material')),
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  quantity        NUMERIC NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_returns_company ON material_returns (company_id, return_type);

ALTER TABLE material_returns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS order_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  order_id        UUID NOT NULL REFERENCES orders(id),
  customer_id     UUID NOT NULL,
  amount_total    NUMERIC NOT NULL,  -- order.total_amount, snapshotted at return time
  amount_returned NUMERIC NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_company ON order_returns (company_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_order ON order_returns (order_id);

ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;
