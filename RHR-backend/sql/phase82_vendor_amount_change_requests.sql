-- Admin edits to a vendor-transfer amount in the Vendor Ledger no longer apply straight away:
-- they become a request that shows in Salesman Recovery -> Pending Approvals (who asked,
-- which vendor/customer, old -> new amount). Approving it updates the vendor ledger, the
-- salesman recovery (History), the customer ledger and the expense together.
-- Run on BOTH Supabase projects.
CREATE TABLE IF NOT EXISTS vendor_amount_change_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL,
  supplier_id              uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_name            text,
  supplier_ledger_entry_id uuid NOT NULL,
  recovery_id              uuid,
  customer_id              uuid,
  customer_name            text,
  entry_date               date,
  old_amount               numeric(14,2) NOT NULL,
  new_amount               numeric(14,2) NOT NULL,
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by             uuid,
  requested_by_name        text,
  decided_by               uuid,
  decided_by_name          text,
  decided_at               timestamptz,
  decision_note            text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vacr_company_status ON vendor_amount_change_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_vacr_entry ON vendor_amount_change_requests (supplier_ledger_entry_id);
