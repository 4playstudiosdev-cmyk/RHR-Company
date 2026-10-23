-- ═══════════════════════════════════════════════════════════════
-- Phase 73 — rejected / deleted recoveries are kept, with who and why.
--
-- Salesman Recovery → "Rejected / Deleted" lists every payment an admin rejected or deleted,
-- instead of those rows disappearing. A deleted row stays in the table with status 'deleted'
-- (all totals only count 'approved', so it no longer counts anywhere); these columns record
-- the reason and who did it. Safe to re-run. Without it the reason is kept in the row's notes.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS removed_reason  TEXT;
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS removed_by      UUID REFERENCES users(id);
ALTER TABLE salesman_recoveries ADD COLUMN IF NOT EXISTS removed_at      TIMESTAMPTZ;
