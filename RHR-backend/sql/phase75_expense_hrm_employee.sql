-- Phase 75: link HRM employees to expenses
-- Run this in Supabase SQL editor to allow recording expenses against
-- employees added in the admin → HRM → Employees panel.
-- The employees table was created in phase9_employees_directory.sql.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id);

CREATE INDEX IF NOT EXISTS expenses_employee_id_idx ON expenses(employee_id);
