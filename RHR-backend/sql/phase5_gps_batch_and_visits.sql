-- ═══════════════════════════════════════════════════════════════
-- Phase 5 — schema changes for GPS batch-ping / route, and for the
-- new customer_visits write endpoint (POST /api/v1/visits).
--
-- Safe to re-run: everything is IF NOT EXISTS.
-- Run this in the Supabase SQL Editor before hitting the new
-- endpoints — supabaseAdmin (the JS client) has no way to run DDL
-- itself, so this can't be applied automatically from the app.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────
-- 1. gps_locations.is_offline — set true on points uploaded via
--    POST /gps/batch-ping (queued while the salesman's phone had no
--    signal, sent once connectivity returns).
-- ───────────────────────────────────────────────
ALTER TABLE gps_locations
ADD COLUMN IF NOT EXISTS is_offline BOOLEAN DEFAULT false;


-- ───────────────────────────────────────────────
-- 2. customer_visits — table may not exist yet on every environment
--    (introduced read-only in phase4 for analytics; created here too
--    so this migration is self-contained either way), plus the
--    columns POST /api/v1/visits actually writes that phase4 didn't
--    include: latitude, longitude, follow_up_date.
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  salesman_id  UUID NOT NULL REFERENCES users(id),
  customer_id  UUID REFERENCES users(id),
  visited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS latitude       DOUBLE PRECISION;
ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS longitude      DOUBLE PRECISION;
ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS follow_up_date DATE;

CREATE INDEX IF NOT EXISTS idx_customer_visits_salesman
  ON customer_visits (salesman_id, visited_at);

ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;
