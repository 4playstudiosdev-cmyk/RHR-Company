-- Driver "Mark as Delivered" now also asks whether (and how much) cash
-- was collected from the customer at the door — credited to the
-- customer's ledger immediately, same as any other payment.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(12,2);

-- Admin sets this when dispatching an order to a driver — 'urgent'
-- orders sort to the top of the driver's to-deliver list and blink.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal';
