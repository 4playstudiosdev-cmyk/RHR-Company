-- Salesman "Cash Collection" self-service deposit flow needs a bank
-- slip photo when depositing via bank (salesman_cash_closings already
-- covers cash/bank deposits + approval, just never had a slip image).
ALTER TABLE salesman_cash_closings ADD COLUMN IF NOT EXISTS slip_image_url TEXT;
