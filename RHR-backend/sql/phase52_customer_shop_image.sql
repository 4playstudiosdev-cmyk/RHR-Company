-- Customer "Complete Your Profile" now also collects a shop photo
-- (shop_latitude/shop_longitude already exist from phase8).
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_image_url TEXT;
