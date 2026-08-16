-- ═══════════════════════════════════════════════════════════════
-- Phase 8 — customer shop location, for:
--  - admin/salesman viewing customer shops on a map (GET /customers
--    already returns these once selected in the controller)
--  - customer setting their own shop location (PATCH /customers/me/location)
--  - customer→salesman distance/ETA (GET /gps/my-salesman)
--
-- Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_latitude  DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_longitude DOUBLE PRECISION;
