-- ═══════════════════════════════════════════════════════════════
-- Pending schema changes — everything the backend code currently
-- expects that hasn't been created yet, plus the missing constraint
-- on the attendance table you already ran.
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, and a guarded DO block for the one plain ADD CONSTRAINT
-- (Postgres has no "ADD CONSTRAINT IF NOT EXISTS" syntax).
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────
-- 1. FIX: attendance — add the unique constraint
--    checkIn/manualAttendance upsert on (user_id, date);
--    without this constraint every call throws
--    "no unique or exclusion constraint matching ON CONFLICT"
-- ───────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE attendance
    ADD CONSTRAINT attendance_user_date_unique UNIQUE (user_id, date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ───────────────────────────────────────────────
-- 2. gps_locations — used by gps.controller.js
--    (pingLocation / getLiveLocations / getLocationHistory)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  latitude     NUMERIC(10,8) NOT NULL,
  longitude    NUMERIC(11,8) NOT NULL,
  accuracy     NUMERIC(6,2),
  status       VARCHAR(20) DEFAULT 'moving',
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Speeds up "latest ping per user" and "today's history" queries
CREATE INDEX IF NOT EXISTS idx_gps_locations_user_recorded
  ON gps_locations (user_id, recorded_at DESC);

ALTER TABLE gps_locations ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────
-- 3. notifications — used by notifications.controller.js
--    (sendNotification / getMyNotifications)
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  recipient_id   UUID REFERENCES users(id),
  recipient_role VARCHAR(20),
  title          VARCHAR(200) NOT NULL,
  body           TEXT NOT NULL,
  type           VARCHAR(30) DEFAULT 'broadcast',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role
  ON notifications (recipient_role, company_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────
-- 4. customer_visits — read by analytics.controller.js's
--    getSalesmanAnalytics (visits this month). No endpoint writes
--    to it yet, so it'll report 0 visits until a check-in-style
--    endpoint is built — creating it now just stops the query
--    from silently querying a nonexistent table.
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  salesman_id  UUID NOT NULL REFERENCES users(id),
  customer_id  UUID REFERENCES users(id),
  visited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_visits_salesman
  ON customer_visits (salesman_id, visited_at);

ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;


-- ───────────────────────────────────────────────
-- 5. users.fcm_token — read by notifications.controller.js
--    to resolve push targets
-- ───────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;


-- ───────────────────────────────────────────────
-- 6. ledger_entries — additional columns introduced by
--    adjustLedger (ledger.controller.js). Table already exists
--    (getLedger has worked against it since Task 1); this only
--    adds whatever adjustLedger needs that may not be there yet.
-- ───────────────────────────────────────────────
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS entry_type     VARCHAR(10);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS amount         NUMERIC(12,2);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS reference_type VARCHAR(30);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES users(id);
