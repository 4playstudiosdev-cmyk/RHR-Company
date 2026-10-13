-- Driver "Mark as Delivered" flow now asks how many bags were actually
-- delivered vs returned/damaged, so admin can see & double-check instead
-- of just trusting a blind status flip.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_bags INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_bags INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
