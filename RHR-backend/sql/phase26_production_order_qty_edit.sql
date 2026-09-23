-- Links a production_orders row to the productions run it triggered
-- (created when "Start Production" runs runProduction) so a later qty
-- correction (PATCH /production/orders/:id/qty) can find and adjust the
-- exact raw-material lines and finished-stock credit that run made,
-- instead of guessing which production run belongs to which order.
ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS production_id UUID REFERENCES productions(id);
