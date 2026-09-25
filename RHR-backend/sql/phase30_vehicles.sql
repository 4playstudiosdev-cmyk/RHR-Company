-- ═══════════════════════════════════════════════════════════════
-- Phase 30 — Vehicle Management: dedicated vehicle entities (separate
-- from drivers — a driver can be reassigned between vehicles, and a
-- vehicle needs its own meter-reading/KM history independent of who's
-- currently driving it) plus fuel/expense linkage.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          VARCHAR(200) NOT NULL,
  plate_number  VARCHAR(50) NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'delivery', -- delivery | pickup | motorcycle | other
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles (company_id, is_active);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS vehicle_meter_readings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  vehicle_id     UUID NOT NULL REFERENCES vehicles(id),
  reading_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  reading_type   VARCHAR(10) NOT NULL DEFAULT 'morning', -- morning | evening
  meter_reading  NUMERIC(12,2) NOT NULL,
  km_driven      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_readings_vehicle ON vehicle_meter_readings (vehicle_id, reading_date DESC, created_at DESC);

ALTER TABLE vehicle_meter_readings ENABLE ROW LEVEL SECURITY;


-- Links a fuel/maintenance expense to the vehicle it was for, and (for
-- Fuel specifically) the liters/price-per-liter that produced the total
-- amount, plus how many bags that trip delivered — the Vehicle Report's
-- fuel-average (km/L) and per-bag-expense figures are derived from these.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS fuel_price_per_liter NUMERIC(10,2);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC(10,2);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS bags_delivered NUMERIC(10,2);
