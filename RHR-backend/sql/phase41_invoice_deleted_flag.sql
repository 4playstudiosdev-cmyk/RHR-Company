-- Marks an order's invoice as permanently deleted (super_admin action,
-- see DELETE /orders/:id/invoice) so the desktop Orders page can show a
-- "Deleted" status instead of silently clearing invoice_generated_at and
-- letting "Create Invoice" reappear as if nothing happened.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_deleted_at TIMESTAMPTZ;
