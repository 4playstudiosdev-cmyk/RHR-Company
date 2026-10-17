-- Phase 65 — collapse the per-city product categories into three:
--   Tile Bond  = "Tile Bond (Gray)" + "Tile Bond (White)"
--   Grout      = "Tile Grout"
--   Other      = "Finishing & Repair" + "Waterproofing"
--
-- Names matter: the order-quantity rules (orderQtyRules.js) and the
-- manufacturing payout look for "tile bond" / "grout" inside the category
-- name, so "Tile Bond" and "Grout" keep every existing rule working.
-- sort_order drives the tab order everywhere (All -> Tile Bond -> Grout ->
-- Other); GET /categories now orders by it.
--
-- Safe to re-run: each step only acts on rows that still have the old name.
-- Runs per company (every branch has its own category rows).

DO $$
DECLARE
  comp UUID;
  keep_id UUID;
  dup RECORD;
  spec RECORD;
BEGIN
  FOR comp IN SELECT DISTINCT company_id FROM categories LOOP
    FOR spec IN
      SELECT * FROM (VALUES
        ('Tile Bond', 1, ARRAY['Tile Bond (Gray)', 'Tile Bond (White)', 'Tile Bond']),
        ('Grout',     2, ARRAY['Tile Grout', 'Grout']),
        ('Other',     3, ARRAY['Finishing & Repair', 'Waterproofing', 'Other'])
      ) AS t(target, sort_order, sources)
    LOOP
      -- the row that survives: the first source name that exists for this company
      SELECT id INTO keep_id FROM categories
        WHERE company_id = comp AND name = ANY(spec.sources)
        ORDER BY array_position(spec.sources, name)
        LIMIT 1;
      CONTINUE WHEN keep_id IS NULL;

      -- fold every other source category's products into it, then drop the empty row
      FOR dup IN
        SELECT id FROM categories
        WHERE company_id = comp AND name = ANY(spec.sources) AND id <> keep_id
      LOOP
        UPDATE products SET category_id = keep_id WHERE category_id = dup.id;
        DELETE FROM categories WHERE id = dup.id;
      END LOOP;

      UPDATE categories SET name = spec.target, sort_order = spec.sort_order WHERE id = keep_id;
    END LOOP;
  END LOOP;
END $$;

-- Check: expect exactly Tile Bond (1), Grout (2), Other (3) per company.
-- SELECT company_id, sort_order, name FROM categories ORDER BY company_id, sort_order;
