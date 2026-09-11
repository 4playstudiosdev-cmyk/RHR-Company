-- Adds the rate_tier column the Customer Approval "Rate Tier" dialog
-- needs. Run this in the Supabase SQL editor before using it — until
-- then, approving a customer still works (rate_tier update is best-effort
-- and non-fatal, see auth.service.js's approveCustomer), it just won't
-- persist the selected tier and every customer prices as 'manual'.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rate_tier TEXT NOT NULL DEFAULT 'manual'
    CHECK (rate_tier IN ('manual', 'discount', 'premium'));

COMMENT ON COLUMN users.rate_tier IS
  'Per-customer pricing tier, set once at approval time: '
  'manual = standard price, discount = price - PKR 10, premium = price + PKR 10. '
  'Applied to order_items.unit_price at order-creation time — see orders.service.js.';
