-- ═══════════════════════════════════════════════════════════════
-- Phase 63 — Record Payment's Cash option now posts through the same
-- salesman_recoveries flow Cash Collection's own "Collect Cash" button
-- already used (instant ledger credit, shows in Cash In Hand), instead
-- of the old admin-review /payments table. Record Payment requires a
-- photo of the cash/receipt, which salesman_recoveries had no column
-- for.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS photo_url TEXT;
