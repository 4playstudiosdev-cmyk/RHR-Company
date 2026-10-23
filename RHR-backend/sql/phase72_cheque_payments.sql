-- ═══════════════════════════════════════════════════════════════
-- Phase 72 — cheque payments in Salesman Recovery.
--
-- "Cheque" becomes a payment method next to Cash / Online / Bank Transfer (salesman app
-- Record Payment, and the desktop Salesman Recovery form). A cheque is saved with its
-- details and sits as PENDING in Salesman Recovery → Cheques. When the bank clears it the
-- admin marks it Cleared and chooses where the money went (a bank account, or Cash) — only
-- then is the customer's ledger credited. A cheque that bounces is marked Returned.
--
-- Run this in the Supabase SQL Editor BEFORE using cheques. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cheque_number            VARCHAR(50);
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cheque_bank              VARCHAR(100);
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cheque_date              DATE;
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cheque_status            VARCHAR(15);   -- pending | cleared | returned
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cleared_at               TIMESTAMPTZ;
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cleared_to               VARCHAR(10);   -- bank | cash
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS cleared_bank_account_id  UUID REFERENCES bank_accounts(id);
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS returned_at              TIMESTAMPTZ;
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS return_reason            TEXT;

-- payment_type was VARCHAR(10); 'cheque' fits, but make sure no old CHECK rejects it.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'salesman_recoveries'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_type%'
  LOOP
    EXECUTE format('ALTER TABLE salesman_recoveries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
