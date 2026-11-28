-- phase83 — Activity log (order tracker)
--
-- One row per thing that happened, so the office can see afterwards exactly
-- what was done and by whom:
--   order_placed / order_refused  — every order attempt from the app or web, with
--                                   items, total, balance and credit limit at that
--                                   moment, and the refusal reason
--   cart_changes                  — how the salesman built the order (qty 0→500,
--                                   500→200 = 300 removed, …), sent by the app
--   order_status                  — status changes (who, old → new)
--   order_date                    — order date changed (old → new)
--   order_items                   — items / quantities edited after placing
--   credit_limit                  — customer credit limit changed (old → new)
--
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID,
  customer_id  UUID,
  order_id     UUID,
  action       TEXT NOT NULL,
  actor_id     UUID,
  actor_role   TEXT,
  actor_name   TEXT,
  summary      TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_customer ON activity_log (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_order    ON activity_log (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_company  ON activity_log (company_id, created_at DESC);

GRANT ALL ON activity_log TO service_role;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON activity_log;
CREATE POLICY "service_role_all" ON activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
