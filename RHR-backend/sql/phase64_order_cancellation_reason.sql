-- ═══════════════════════════════════════════════════════════════
-- Phase 64 — Admin cancelling an order from the web portal now
-- captures why, instead of just flipping the status with no record of
-- the reason.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
