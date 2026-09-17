-- Two independent additions:
--
-- 1. raw_materials.is_active — Raw Materials "Delete" soft-deletes
--    instead of a hard DELETE FROM, because real recipes
--    (production_bom_items.raw_material_id) and stock history
--    (raw_material_stock_logs.material_id) reference these rows — a
--    hard delete would either violate those FKs or, if cascaded,
--    silently destroy recipe/history data. Same pattern already used
--    for products/salesmen/drivers/employees/customers.
--
-- 2. users.driver_id — customer-to-driver assignment, mirroring the
--    existing users.salesman_id (see phase6). Nullable, no default —
--    unassigned unless set.
--
-- Run this in the Supabase SQL editor before using: Raw Materials'
-- Edit/Delete actions, or the customer-driver assignment dropdown on
-- the Customers page. Until then, those specific API calls fail
-- (column/filter doesn't exist yet) but nothing else in the app is
-- affected.

ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

COMMENT ON COLUMN raw_materials.is_active IS
  'Soft-delete flag — false means deleted. Kept (not hard-deleted) so '
  'existing recipes/stock-log history referencing this material still resolve.';

COMMENT ON COLUMN users.driver_id IS
  'The driver assigned to this customer row, same shape as users.salesman_id.';
