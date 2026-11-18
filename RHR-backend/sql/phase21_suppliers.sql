-- Suppliers directory for the Raw Materials → Purchase flow's supplier
-- autocomplete, and a standalone management panel (mirrors salesmen).
CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  name           VARCHAR(200) NOT NULL,
  address        TEXT,
  contact_number VARCHAR(50),
  -- Which raw material categories this supplier deals in — same values
  -- as MATERIAL_CATEGORIES in RawMaterials.jsx (binder/filler/chemical/
  -- pigment/packaging/other), not a free-text list.
  categories     TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- In case phase21 already ran without these (re-running this file is safe).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_number VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers (company_id);

-- One name per branch — the purchase flow checks this before inserting a
-- typed name, so a second purchase from the same supplier reuses the row
-- instead of creating a near-duplicate ("Lucky Cement" vs "lucky cement").
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_company_name
  ON suppliers (company_id, lower(name));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Seed inserts removed — data will be migrated via migration script
