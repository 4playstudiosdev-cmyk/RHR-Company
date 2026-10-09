-- Customer profile needs BOTH sides of the NIC, not just one image.
-- nic_image_url (phase47) now means "front"; this adds "back".
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_back_image_url TEXT;
