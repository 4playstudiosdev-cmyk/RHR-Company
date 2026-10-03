-- Optional wastage recorded alongside a production run (Daily Production
-- Entry) — how much raw material was lost/spoiled during that batch,
-- kept as a note on the run itself rather than a raw_material_stock_logs
-- row (that table's material_id is NOT NULL — wastage here is a general
-- figure, not tied to one specific material).
ALTER TABLE productions ADD COLUMN IF NOT EXISTS wastage_qty NUMERIC(10,3);
ALTER TABLE productions ADD COLUMN IF NOT EXISTS wastage_unit VARCHAR(10);
