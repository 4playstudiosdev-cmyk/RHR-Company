-- Links a driver to the vehicle they drive, so the Vehicle Report can
-- attribute bags delivered to a specific vehicle (via the orders that
-- driver delivered) instead of a manual per-expense entry.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
