-- ═══════════════════════════════════════════════════════════════
-- Phase 11 — dedicated drivers table (own portal, own GPS-tracked
-- profile), mirroring the salesmen split from phase6.
--
-- Run this in the Supabase SQL Editor BEFORE deploying the backend
-- code that goes with it — the app code queries `drivers` directly.
--
-- Safe to re-run: guarded with IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drivers (
  id           UUID PRIMARY KEY,                          -- same id as the auth.users row
  company_id   UUID NOT NULL REFERENCES companies(id),
  full_name    VARCHAR(200) NOT NULL,
  phone        VARCHAR(20) UNIQUE,
  car_number   VARCHAR(20),
  is_approved  BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  fcm_token    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- gps_locations.user_id is already a plain, unconstrained UUID column
-- (phase6 step 5 dropped its FK entirely so it could hold a salesman OR
-- delivery-role user id) — a driver id needs zero schema change there.
