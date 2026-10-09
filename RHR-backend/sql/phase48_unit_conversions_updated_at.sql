-- phase35_unit_conversions.sql's CREATE TABLE already listed updated_at,
-- but the column was never actually applied to the live table (the Unit
-- Conversion save form was failing with PGRST204 "column not found").
-- This brings the live table in line with what that file always intended.
ALTER TABLE unit_conversions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
