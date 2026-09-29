-- Opening balances entered once per entity (customer/vendor/raw material/
-- finished good) when the system first goes live, so historical
-- balances aren't lost. Customer opening balances also create a matching
-- ledger_entries row (see opening-balances.routes.js) so the customer's
-- running balance is correct from day one; raw material / finished good
-- opening balances directly set the live stock figure on that item.
CREATE TABLE IF NOT EXISTS opening_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  entity_type   VARCHAR(20) NOT NULL, -- 'customer' | 'vendor' | 'raw_material' | 'finished_good'
  entity_id     UUID,                  -- customer/raw_material/product id — NULL for free-text vendors
  entity_name   VARCHAR(255) NOT NULL,
  balance_type  VARCHAR(10),           -- 'debit' | 'credit' — customers/vendors only
  amount        NUMERIC(14,2),         -- customers/vendors only
  quantity      NUMERIC(14,3),         -- raw_material/finished_good only
  unit          VARCHAR(30),
  notes         TEXT,
  balance_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opening_balances_company ON opening_balances (company_id, entity_type);

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
