-- Adds the JSONB permissions column the Admin Management feature needs.
-- Run this in the Supabase SQL editor before using Admin Management —
-- until then, GET /api/v1/admins still works (permissions just reads as
-- {} for everyone, meaning "everything allowed"), but toggling a
-- permission via PATCH /api/v1/admins/:id/permissions will fail because
-- the column doesn't exist yet.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.permissions IS
  'Per-branch-admin feature toggles, e.g. {"can_view_payments": false}. '
  'Absent/false key = disabled; anything else (including missing key) = allowed. '
  'super_admin always bypasses this (see role.middleware.js requirePermission).';
