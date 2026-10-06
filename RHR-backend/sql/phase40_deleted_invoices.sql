-- Audit record of invoices a super_admin has deleted (see DELETE
-- /api/v1/orders/:id/invoice) — the order itself is kept, only its
-- invoice state (invoice_url/invoice_generated_at/...) is cleared, after
-- a full snapshot of the order lands here first.
CREATE TABLE IF NOT EXISTS deleted_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id  UUID,
  order_number       VARCHAR(100),
  customer_name      VARCHAR(200),
  total_amount       NUMERIC(12,2),
  invoice_url        TEXT,
  deleted_by         UUID REFERENCES users(id),
  deleted_at         TIMESTAMPTZ DEFAULT NOW(),
  reason             TEXT,
  original_data      JSONB
);

GRANT ALL ON deleted_invoices TO service_role;
ALTER TABLE deleted_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON deleted_invoices;
CREATE POLICY "service_role_all" ON deleted_invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);
