-- Customer "Complete Your Profile" feature — full_name, email, shop_name,
-- shop_address and profile_photo_url already exist on users; this adds the
-- three still missing fields. A customer's profile is considered complete
-- only once ALL of full_name/email/nic_number/shop_name/shop_address/
-- whatsapp_phone/profile_photo_url/nic_image_url are filled in (checked at
-- read time in customers.controller.js / auth.controller.js, not stored as
-- a separate flag column, so it self-corrects if a field is ever cleared).
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_image_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(20);
