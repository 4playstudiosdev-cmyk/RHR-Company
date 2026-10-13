-- Salesman and driver now get their own "Complete Your Profile" flow
-- (mirrors the customer one from phase47/49) — image, NIC number, NIC
-- front/back images. Drivers already have car_number from phase11; no
-- change needed there.
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS nic_number VARCHAR(20);
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS nic_image_url TEXT;
ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS nic_back_image_url TEXT;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS nic_number VARCHAR(20);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS nic_image_url TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS nic_back_image_url TEXT;
