-- Per-unit cost on raw materials, set directly on the Raw Materials page
-- (vs. raw_material_stock_logs.price_per_unit, which only records the
-- price paid at the moment of a purchase). This is what runProduction
-- actually multiplies against quantity consumed to get a real
-- productions.total_cost (COGS) — before this column existed that rate
-- was hardcoded to 0, so every production run's total_cost was always 0.
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS cost_per_unit NUMERIC(12,2) DEFAULT 0;
