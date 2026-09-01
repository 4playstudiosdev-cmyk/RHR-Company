-- ═══════════════════════════════════════════════════════════════
-- Phase 13 — Production section's own simple product-name BOM list.
--
-- Deliberately separate from production_recipes/recipe_ingredients
-- (used by the top-level "Recipes" page, which links to a real
-- products.id via product_id). This one takes a free-text product
-- name with no catalog link, per the Production-section "Recipes"
-- page spec — a quick BOM reference, not tied to any /production/
-- produce stock-deduction run.
--
-- Run this in the Supabase SQL Editor before hitting the new
-- /api/v1/production/recipes endpoints. Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS production_bom (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  product_name VARCHAR(200) NOT NULL,
  batch_size   NUMERIC NOT NULL DEFAULT 1,
  batch_unit   VARCHAR(20) NOT NULL DEFAULT 'bag',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_bom_company ON production_bom (company_id);

ALTER TABLE production_bom ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS production_bom_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          UUID NOT NULL REFERENCES production_bom(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES raw_materials(id),
  qty_required    NUMERIC NOT NULL,
  unit            VARCHAR(20) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_bom_items_bom ON production_bom_items (bom_id);

ALTER TABLE production_bom_items ENABLE ROW LEVEL SECURITY;
