-- Persist the tax/conveyance choice made on an order's first invoice, so
-- a later Print or Edit Invoice reprint reapplies the same choice
-- instead of silently dropping it (previously the edited/reprinted
-- invoice always came out as a bare "no tax, no conveyance" total).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_with_tax BOOLEAN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_conveyance NUMERIC(12,2);
