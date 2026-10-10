-- Backs the Vehicle Management "Maintenance Alert" feature — without
-- this, km-since-last-service has no baseline to compute against and
-- the alert can never fire. Set via PATCH /vehicles/:id (the desktop's
-- "Mark Serviced" action sets it to the vehicle's current odometer).
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_service_odometer NUMERIC(12,2);
