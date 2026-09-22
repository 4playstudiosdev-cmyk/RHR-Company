-- Fuel/Vehicle Maintenance expenses need to be tied to which vehicle
-- (driver) they were actually for, so those costs can be traced back to
-- a specific car rather than just sitting in a category bucket.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS driver_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_driver'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT fk_expenses_driver
      FOREIGN KEY (driver_id) REFERENCES drivers(id);
  END IF;
END $$;
