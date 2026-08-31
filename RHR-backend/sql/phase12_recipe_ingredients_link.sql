-- ═══════════════════════════════════════════════════════════════
-- Phase 12 — link recipe_ingredients to a real raw_materials row.
--
-- recipe_ingredients was created with only a free-text `ingredient_name`
-- column (no FK to raw_materials) — fine for a cost-only recipe list, but
-- production's automatic stock deduction needs a precise link to a
-- specific raw_materials.id, not a name match (fragile: typos, renames,
-- duplicate names all silently break it).
--
-- Run this in the Supabase SQL Editor before hitting the updated
-- /api/v1/recipes and /api/v1/production/produce endpoints.
--
-- Additive only — ingredient_name/rate_per_unit/total_cost are untouched,
-- existing rows keep working, safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS raw_material_id UUID REFERENCES raw_materials(id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_raw_material
  ON recipe_ingredients (raw_material_id);

-- production_recipes also has no `notes` column, but the desktop recipe
-- form already collects one — add it rather than silently dropping the field.
ALTER TABLE production_recipes
  ADD COLUMN IF NOT EXISTS notes TEXT;
