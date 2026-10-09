-- Lets a "Raw Material Purchase" expense record which vendor it was paid
-- to (reuses the existing suppliers directory — see sql/phase21_suppliers.sql).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
