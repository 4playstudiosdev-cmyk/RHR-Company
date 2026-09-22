-- Orders page dispatch popup (status -> 'dispatched') records who's
-- driving and the vehicle — same driver_id pattern as
-- phase19_dispatch_driver.sql for the Production/Dispatch page, applied
-- here to the customer-order flow instead.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS car_number VARCHAR(50);
