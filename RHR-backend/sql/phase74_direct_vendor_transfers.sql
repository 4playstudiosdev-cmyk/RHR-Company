-- Direct vendor transfer: customer pays their debt via our vendor payable.
-- Adds vendor_id to salesman_recoveries so a payment_type='vendor_transfer'
-- row can record which supplier's payable was cleared at the same time.
ALTER TABLE salesman_recoveries
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;
