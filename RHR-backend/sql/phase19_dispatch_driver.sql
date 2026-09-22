-- Dispatch currently stores the driver as free text (dispatches.driver).
-- This adds a real FK to the drivers table so dispatch can be assigned
-- from a dropdown and joined back to full driver details (car_number,
-- phone) — driver (text) stays as-is for backward compatibility with
-- existing dispatch records and as a denormalized display fallback.
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);
