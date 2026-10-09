-- Manufacturing Employee module — a Head of Manufacturing leads a team of
-- Workers. On a day Tile Bond bags are produced, the client pays PKR 10
-- per bag: PKR 1/bag goes straight to the Head (every day a batch is
-- produced, whether the Head was personally present or not — see
-- manufacturing.controller.js#calculatePayout), and the remaining PKR
-- 9/bag is split evenly across whichever Workers are marked present that
-- day (attendance is recorded first, then the split is computed only
-- across present workers).

CREATE TABLE IF NOT EXISTS manufacturing_heads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  full_name  VARCHAR(200) NOT NULL,
  phone      VARCHAR(20),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manufacturing_heads_company ON manufacturing_heads (company_id);

ALTER TABLE manufacturing_heads ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS manufacturing_workers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  head_id    UUID NOT NULL REFERENCES manufacturing_heads(id),
  full_name  VARCHAR(200) NOT NULL,
  phone      VARCHAR(20),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manufacturing_workers_head ON manufacturing_workers (head_id);

ALTER TABLE manufacturing_workers ENABLE ROW LEVEL SECURITY;


-- One row per worker per day — present/absent is recorded before the
-- payout is calculated, since the Rs 9/bag worker pool only splits across
-- whoever is marked present that day.
CREATE TABLE IF NOT EXISTS manufacturing_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES manufacturing_workers(id),
  attendance_date DATE NOT NULL,
  present         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_manufacturing_attendance_date ON manufacturing_attendance (attendance_date);

ALTER TABLE manufacturing_attendance ENABLE ROW LEVEL SECURITY;


-- One row per person per day the payout was calculated — a head's row
-- (worker_id NULL) always gets created once bags are entered for their
-- team that day, regardless of the head's own attendance; a worker's row
-- only exists for workers who were present.
CREATE TABLE IF NOT EXISTS manufacturing_earnings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  head_id        UUID NOT NULL REFERENCES manufacturing_heads(id),
  worker_id      UUID REFERENCES manufacturing_workers(id),
  role           VARCHAR(10) NOT NULL CHECK (role IN ('head', 'worker')),
  earning_date   DATE NOT NULL,
  bags_produced  NUMERIC(10,2) NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (head_id, worker_id, earning_date)
);

CREATE INDEX IF NOT EXISTS idx_manufacturing_earnings_date ON manufacturing_earnings (earning_date);
CREATE INDEX IF NOT EXISTS idx_manufacturing_earnings_head ON manufacturing_earnings (head_id, earning_date);

ALTER TABLE manufacturing_earnings ENABLE ROW LEVEL SECURITY;
