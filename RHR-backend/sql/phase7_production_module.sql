-- ═══════════════════════════════════════════════════════════════
-- Phase 7 — Production module: raw materials, production orders,
-- dispatch. "Production Demand" itself has no table — it's computed
-- live from order_items/orders/products/categories (see
-- production.controller.js), so nothing to create for that.
--
-- Run this in the Supabase SQL Editor before hitting the new
-- /api/v1/production/* endpoints. Safe to re-run (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS raw_materials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name       VARCHAR(200) NOT NULL,
  category   VARCHAR(50) NOT NULL,
  unit       VARCHAR(20) NOT NULL,
  stock      NUMERIC NOT NULL DEFAULT 0,
  min_level  NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_materials_company ON raw_materials (company_id);

ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;


-- Audit trail for "Add Stock" — also the only real source of truth for
-- material movement until a recipe/BOM system exists to derive consumption.
CREATE TABLE IF NOT EXISTS raw_material_stock_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES raw_materials(id),
  company_id  UUID NOT NULL REFERENCES companies(id),
  quantity    NUMERIC NOT NULL,
  note        TEXT,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_logs_material ON raw_material_stock_logs (material_id, logged_date DESC);

ALTER TABLE raw_material_stock_logs ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS production_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  order_number VARCHAR(30) UNIQUE NOT NULL,
  product_id   UUID REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  unit         VARCHAR(20) NOT NULL,
  qty          NUMERIC NOT NULL,
  batches      INT NOT NULL DEFAULT 1,
  priority     VARCHAR(10) NOT NULL DEFAULT 'normal',
  notes        TEXT,
  start_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_orders_company ON production_orders (company_id, status);

ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS dispatches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  dispatch_number     VARCHAR(30) UNIQUE NOT NULL,
  production_order_id UUID REFERENCES production_orders(id),
  product_name        VARCHAR(200) NOT NULL,
  unit                VARCHAR(20) NOT NULL,
  qty                 NUMERIC NOT NULL,
  destination         VARCHAR(100) NOT NULL,
  driver              VARCHAR(100) NOT NULL,
  notes               TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'in_transit',
  dispatched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_dispatches_company ON dispatches (company_id, status);

ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
