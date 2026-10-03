-- Order Return previously only recorded a lump PKR amount. Adds which
-- product/line item was returned, how many, and the condition it came
-- back in, so a return actually says what physically happened, not just
-- how much money moved.
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id);
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS product_name VARCHAR(200);
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS quantity_returned NUMERIC;
ALTER TABLE order_returns ADD COLUMN IF NOT EXISTS item_condition VARCHAR(20); -- 'good' | 'damaged' | 'expired'
