-- Phase 68 — customer visits carry where the salesman was when they marked
-- the visit. latitude / longitude already exist on customer_visits (phase5);
-- this adds how accurate that GPS fix was (metres), and an index so the
-- admin "Customer Visits" page and salesman reports filter by date quickly.
--
-- Safe to re-run. The app and API work without it (the visit and its
-- location are still saved) — it only adds the accuracy figure.

ALTER TABLE customer_visits ADD COLUMN IF NOT EXISTS location_accuracy_m INTEGER;

CREATE INDEX IF NOT EXISTS idx_customer_visits_company_visited
  ON customer_visits (company_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_visits_salesman_visited
  ON customer_visits (salesman_id, visited_at DESC);
