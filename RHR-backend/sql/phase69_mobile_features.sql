-- Phase 69 — per-account on/off switches for the mobile apps (desktop →
-- Mobile Access, super admin only) and driver "sales access".
--
-- customers already have users.permissions (JSONB). Salesmen and drivers
-- didn't, so they get one. The value is a small object such as
--   {"new_order": false}            -- a salesman who can't place orders
--   {"sales_access": true}          -- a driver who also has salesman powers
-- A missing key means the feature's default (on, except a driver's
-- sales_access which is off) — so nothing changes for anyone until a switch
-- is flipped.
--
-- Safe to re-run. The apps and API keep working without it (everything just
-- behaves as defaults); this is what lets the switches be saved.

ALTER TABLE salesmen ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
-- users.permissions already exists (phase10) — this is just a safety net.
ALTER TABLE users    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
