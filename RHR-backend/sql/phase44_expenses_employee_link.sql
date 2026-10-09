-- Lets a "Salaries" expense record WHO it was paid to — a driver
-- (expenses.driver_id already existed, reused here), a salesman, or a
-- Manufacturing Worker — so salary payments for any employee type land
-- in the same Expenses record the admin already uses day to day.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES salesmen(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS manufacturing_worker_id UUID REFERENCES manufacturing_workers(id);
