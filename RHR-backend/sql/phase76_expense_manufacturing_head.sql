-- Phase 76: link Manufacturing Head to expenses
-- Run this in Supabase SQL editor so Head-of-Manufacturing entries can be
-- recorded as an expense person (alongside workers, drivers, salesmen etc.)

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS manufacturing_head_id uuid REFERENCES manufacturing_heads(id);

CREATE INDEX IF NOT EXISTS expenses_manufacturing_head_id_idx ON expenses(manufacturing_head_id);
