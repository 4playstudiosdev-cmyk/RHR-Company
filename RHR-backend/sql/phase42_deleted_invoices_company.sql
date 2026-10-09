-- deleted_invoices had no company_id column at all — fine while only
-- super_admin could see it (always unscoped), but branch_admin now has
-- access too and must only ever see their own branch's deleted orders.
ALTER TABLE deleted_invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_deleted_invoices_company ON deleted_invoices (company_id);
