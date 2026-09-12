-- Per-customer, per-product custom pricing — a specific override price
-- for one customer on one product, on top of (and taking precedence
-- over) the flat rate_tier adjustment from phase15. Run this in the
-- Supabase SQL editor before using the "Set Custom Pricing" feature on
-- the Customers page — until then, the feature's API calls will fail
-- with "table does not exist" but nothing else in the app is affected
-- (order creation falls back to rate_tier / catalog price as before).

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id),
  price       NUMERIC NOT NULL CHECK (price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_customer ON customer_product_prices(customer_id);

GRANT ALL ON customer_product_prices TO service_role;
ALTER TABLE customer_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_product_prices_service_role ON customer_product_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE customer_product_prices IS
  'Per-customer, per-product price override. Takes precedence over users.rate_tier '
  'for that specific product at order-creation time — see orders.service.js.';
