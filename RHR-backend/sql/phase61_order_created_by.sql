-- ═══════════════════════════════════════════════════════════════
-- Phase 61 — Track who actually created each order (admin / salesman /
-- customer), independent of orders.salesman_id (which now always holds
-- the customer's ASSIGNED salesman regardless of who clicked "create" —
-- see the phase60-era orders.service.js fix). Needed for the admin
-- "Order Source" panel to separate orders by creator.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_role TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_id UUID;
