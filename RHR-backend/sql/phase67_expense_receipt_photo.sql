-- Phase 67 — a photo of the bill/receipt can be attached to an expense.
-- Desktop Expenses page: "Add Photo" on the Add Expense form uploads to the
-- private "expense-receipts" storage bucket (created on first upload) and
-- the link is kept here; "View Photo" in the list opens it.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
