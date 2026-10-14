-- ═══════════════════════════════════════════════════════════════
-- Phase 59 — Customer credit limit: max outstanding ledger balance
-- (ledger_entries.running_balance, debit-positive) a customer can carry
-- before orders.service.js's createOrder starts rejecting new orders.
-- NULL/0 means no limit (default, so existing approved customers are
-- unaffected until an admin sets one).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2);
