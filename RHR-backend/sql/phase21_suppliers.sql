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

-- Seeded into Karachi — move/copy any of these to Hyderabad or Sukkur
-- from the new Suppliers panel if they actually supply those branches too.
INSERT INTO suppliers (company_id, name) VALUES
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Lucky Cement OPC'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Cherat Packaging Limited'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'DWM Trading Co Chemical'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Fahad Traders Bag'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Usman Paper Bags'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Kamran Sahab POP'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Shabbir Sahab Chemical'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Brothers Group'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Standard Colors'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Waseem Bottle'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Hutaib Industrial'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Kamran patlo chemical'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Osama Bags'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Sultan Blocks'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Aqeel Bhai Snow White'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Gull Baig Sand'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Guides Corporation'),
  ('1e5962c6-33a7-460b-913e-9e08db46973a', 'Taimoor Chawk')
ON CONFLICT (company_id, lower(name)) DO NOTHING;
