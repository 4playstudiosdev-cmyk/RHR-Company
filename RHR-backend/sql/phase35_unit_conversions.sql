-- Per-raw-material purchase-vs-consumption unit rule (e.g. cement is
-- purchased by the bag but consumed by the kg in recipes). One row per
-- raw_material_id — upserted from the Unit Conversion tab in Raw
-- Materials (see production.routes.js). Lets stock figures display in
-- both units ("1250 kg (~25 bags)") and lets production runs additionally
-- log bags_used alongside the kg qty_used on production_lines (phase per
-- the ALTER already run: production_lines.bags_used).
CREATE TABLE IF NOT EXISTS unit_conversions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  raw_material_id   UUID NOT NULL REFERENCES raw_materials(id),
  purchase_unit     VARCHAR(30) NOT NULL,   -- e.g. 'bag'
  consumption_unit  VARCHAR(30) NOT NULL,   -- e.g. 'kg'
  bag_weight        NUMERIC(10,3) NOT NULL, -- e.g. 50
  bag_weight_unit   VARCHAR(30) NOT NULL,   -- e.g. 'kg' — matches consumption_unit in the normal case
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (raw_material_id)
);

ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;
