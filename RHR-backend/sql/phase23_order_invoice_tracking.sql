-- Tracks whether an invoice has ever been generated for an order — the
-- Orders page's "Create Invoice" button switches to "Edit Invoice" once
-- this is set, per phase23's own feature request.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMPTZ;
