-- Customers live in the `users` table (role='customer') — city/area are
-- free-text fields for filtering the customer database by location,
-- separate from company_id (branch) and shop_address (full address).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS area VARCHAR(100);
