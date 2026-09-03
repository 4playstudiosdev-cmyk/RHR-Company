-- ═══════════════════════════════════════════════════════════════
-- Phase 14 — let productions.recipe_id point at EITHER recipe system.
--
-- There are now two independent recipe tables:
--   production_recipes  (top-level "Recipes" page, cost-line capable)
--   production_bom      (Production section's own "Recipes" page —
--                        phase13 — this is where real usage has
--                        actually been happening: e.g. "Patlo Sealer")
--
-- /production/produce needs to accept a recipe_id from either one, but
-- productions.recipe_id had a hard FK to production_recipes only, so
-- logging production against a production_bom recipe (like Patlo
-- Sealer) was rejected outright ("Key (recipe_id)=(...) is not present
-- in table production_recipes") — that's *why* Chemical 1/2 stock
-- never actually deducted: the produce call never got as far as
-- deducting anything.
--
-- Same "polymorphic, validated at the app layer" pattern already used
-- for gps_locations.user_id etc. (see phase6) — drop the FK rather
-- than trying to reference two tables at once (Postgres can't).
--
-- Run this in the Supabase SQL Editor before hitting the updated
-- /api/v1/production/produce and /api/v1/production/history endpoints.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
    WHERE c.contype = 'f' AND rel.relname = 'productions' AND att.attname = 'recipe_id'
  LOOP
    EXECUTE format('ALTER TABLE productions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;
