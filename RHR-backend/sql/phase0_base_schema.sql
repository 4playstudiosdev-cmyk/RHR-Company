-- ═══════════════════════════════════════════════════════════════
-- PHASE 0 — BASE SCHEMA
-- Core tables that all later phases depend on.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS throughout).
-- ═══════════════════════════════════════════════════════════════

-- ── companies ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  city        TEXT,
  is_hq       BOOLEAN DEFAULT false,
  phone       TEXT,
  address     TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ── users ───────────────────────────────────────────────────────
-- Extends auth.users (same UUID).
CREATE TABLE IF NOT EXISTS users (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id                UUID REFERENCES companies(id),
  role                      TEXT NOT NULL DEFAULT 'customer',
  full_name                 TEXT,
  shop_name                 TEXT,
  shop_address              TEXT,
  phone                     TEXT,
  whatsapp_phone            TEXT,
  email                     TEXT,
  salesman_id               UUID,
  driver_id                 UUID,
  position                  TEXT,
  rate_tier                 TEXT,
  city                      TEXT,
  area                      TEXT,
  nic_number                TEXT,
  nic_image_url             TEXT,
  nic_back_image_url        TEXT,
  shop_image_url            TEXT,
  profile_photo_url         TEXT,
  shop_latitude             NUMERIC(10,8),
  shop_longitude            NUMERIC(11,8),
  permissions               JSONB,
  credit_limit              NUMERIC(14,2) DEFAULT 0,
  fcm_token                 TEXT,
  active_session_token      TEXT,
  active_session_started_at TIMESTAMPTZ,
  is_approved               BOOLEAN DEFAULT false,
  is_active                 BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ── salesmen ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salesmen (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id         UUID REFERENCES companies(id),
  full_name          TEXT,
  phone              TEXT,
  email              TEXT,
  position           TEXT,
  nic_number         TEXT,
  nic_image_url      TEXT,
  nic_back_image_url TEXT,
  profile_photo_url  TEXT,
  permissions        JSONB,
  fcm_token          TEXT,
  is_approved        BOOLEAN DEFAULT false,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE salesmen ENABLE ROW LEVEL SECURITY;

-- ── suppliers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id),
  name           TEXT NOT NULL,
  contact_number TEXT,
  address        TEXT,
  categories     TEXT[],
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- ── products ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id),
  category_id      UUID,
  name             TEXT NOT NULL,
  description      TEXT,
  sku              TEXT,
  price            NUMERIC(14,2) DEFAULT 0,
  stock_quantity   NUMERIC(14,2) DEFAULT 0,
  unit             TEXT DEFAULT 'bag',
  image_url        TEXT,
  packing          TEXT,
  quality_percent  NUMERIC(5,2),
  colors_available TEXT[],
  has_variants     BOOLEAN DEFAULT false,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ── bank_accounts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id),
  account_name         TEXT,
  account_number       TEXT,
  bank_name            TEXT,
  branch_name          TEXT,
  opening_balance      NUMERIC(14,2) DEFAULT 0,
  opening_balance_date DATE,
  is_active            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- ── orders ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id),
  customer_id          UUID REFERENCES users(id),
  salesman_id          UUID REFERENCES salesmen(id),
  driver_id            UUID,
  created_by_id        UUID,
  created_by_role      TEXT,
  order_number         TEXT,
  order_date           DATE,
  status               TEXT DEFAULT 'pending',
  total_amount         NUMERIC(14,2) DEFAULT 0,
  notes                TEXT,
  delivery_address     TEXT,
  car_number           TEXT,
  delivered_bags       NUMERIC(10,2),
  returned_bags        NUMERIC(10,2),
  delivery_notes       TEXT,
  amount_collected     NUMERIC(14,2),
  priority             TEXT,
  invoice_url          TEXT,
  invoice_generated_at TIMESTAMPTZ,
  invoice_with_tax     BOOLEAN DEFAULT false,
  invoice_conveyance   NUMERIC(14,2),
  invoice_deleted_at   TIMESTAMPTZ,
  cancellation_reason  TEXT,
  is_active            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ── order_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  product_name TEXT,
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price   NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal     NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ── salesman_recoveries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salesman_recoveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES companies(id),
  salesman_id           UUID REFERENCES salesmen(id),
  customer_id           UUID REFERENCES users(id),
  vendor_id             UUID REFERENCES suppliers(id),
  cleared_bank_account_id UUID REFERENCES bank_accounts(id),
  amount                NUMERIC(14,2) NOT NULL,
  payment_type          TEXT NOT NULL DEFAULT 'cash',
  payment_method        TEXT,
  reference_number      TEXT,
  notes                 TEXT,
  status                TEXT DEFAULT 'pending',
  recovery_date         DATE,
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  created_by            UUID,
  driver_id             UUID,
  photo_url             TEXT,
  cheque_number         TEXT,
  cheque_bank           TEXT,
  cheque_date           DATE,
  cheque_status         TEXT,
  cleared_at            TIMESTAMPTZ,
  cleared_to            TEXT,
  returned_at           TIMESTAMPTZ,
  return_reason         TEXT,
  removed_reason        TEXT,
  removed_by            UUID,
  removed_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE salesman_recoveries ENABLE ROW LEVEL SECURITY;

-- ── ledger_entries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  customer_id     UUID REFERENCES users(id),
  entry_type      TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  running_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  description     TEXT,
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- ── supplier_ledger_entries ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  supplier_id     UUID REFERENCES suppliers(id),
  entry_type      TEXT NOT NULL DEFAULT 'debit',
  amount          NUMERIC(14,2) NOT NULL,
  running_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  description     TEXT,
  reference_type  TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

-- ── expenses ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID REFERENCES companies(id),
  category                TEXT,
  description             TEXT,
  amount                  NUMERIC(14,2) NOT NULL,
  cash_amount             NUMERIC(14,2),
  bank_amount             NUMERIC(14,2),
  expense_date            DATE NOT NULL,
  method                  TEXT DEFAULT 'cash',
  bank_account_id         UUID REFERENCES bank_accounts(id),
  expense_account_id      UUID,
  supplier_id             UUID REFERENCES suppliers(id),
  salesman_id             UUID REFERENCES salesmen(id),
  driver_id               UUID,
  vehicle_id              UUID,
  manufacturing_worker_id UUID,
  manufacturing_head_id   UUID,
  employee_id             UUID,
  fuel_price_per_liter    NUMERIC(10,2),
  fuel_liters             NUMERIC(10,2),
  bags_delivered          NUMERIC(10,2),
  receipt_url             TEXT,
  created_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ── notifications ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id),
  recipient_id   UUID,
  recipient_role TEXT,
  title          TEXT,
  body           TEXT,
  type           TEXT,
  reference_id   UUID,
  is_read        BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ── customer_visits ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies(id),
  salesman_id         UUID REFERENCES salesmen(id),
  customer_id         UUID REFERENCES users(id),
  notes               TEXT,
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  follow_up_date      DATE,
  location_accuracy_m INTEGER,
  visited_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;

-- ── drivers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id),
  full_name          TEXT NOT NULL,
  phone              TEXT,
  car_number         TEXT,
  nic_number         TEXT,
  profile_photo_url  TEXT,
  nic_image_url      TEXT,
  nic_back_image_url TEXT,
  permissions        JSONB DEFAULT '{}'::jsonb,
  fcm_token          TEXT,
  vehicle_id         UUID,
  is_approved        BOOLEAN DEFAULT false,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- ── vehicles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id),
  name         TEXT,
  plate_number TEXT,
  type         TEXT,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- ── employees ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  full_name  TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  city       TEXT,
  salary     NUMERIC(14,2),
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- ── salary_structures ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_structures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id),
  user_id        UUID,
  basic_salary   NUMERIC(14,2) DEFAULT 0,
  allowances     NUMERIC(14,2) DEFAULT 0,
  deductions     NUMERIC(14,2) DEFAULT 0,
  working_days   INTEGER DEFAULT 26,
  effective_from DATE,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

-- ── leave_requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  user_id     UUID,
  leave_type  TEXT,
  start_date  DATE,
  end_date    DATE,
  reason      TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- ── raw_materials (needed by recipe_ingredients FK) ─────────────
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
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;

-- ── recipe_ingredients ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID,
  raw_material_id UUID REFERENCES raw_materials(id),
  ingredient_name TEXT,
  quantity        NUMERIC(14,4) DEFAULT 0,
  unit            TEXT,
  rate_per_unit   NUMERIC(14,2) DEFAULT 0,
  total_cost      NUMERIC(14,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- ── manufacturing_workers ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturing_workers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  head_id    UUID,
  full_name  TEXT NOT NULL,
  phone      TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE manufacturing_workers ENABLE ROW LEVEL SECURITY;

-- ── manufacturing_attendance ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturing_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       UUID NOT NULL REFERENCES manufacturing_workers(id),
  attendance_date DATE NOT NULL,
  present         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, attendance_date)
);
ALTER TABLE manufacturing_attendance ENABLE ROW LEVEL SECURITY;

-- ── manufacturing_earnings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturing_earnings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id),
  head_id        UUID,
  worker_id      UUID,
  role           TEXT,
  earning_date   DATE NOT NULL,
  bags_produced  NUMERIC(10,2) DEFAULT 0,
  bags_count     NUMERIC(10,2) DEFAULT 0,
  amount         NUMERIC(14,2) DEFAULT 0,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE manufacturing_earnings ENABLE ROW LEVEL SECURITY;

-- ── expense_accounts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  name            TEXT NOT NULL,
  opening_balance NUMERIC(14,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);
ALTER TABLE expense_accounts ENABLE ROW LEVEL SECURITY;

-- ── attendance ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  user_id       UUID REFERENCES users(id),
  date          DATE NOT NULL,
  check_in      TIMESTAMPTZ,
  check_out     TIMESTAMPTZ,
  check_in_lat  DOUBLE PRECISION,
  check_in_lng  DOUBLE PRECISION,
  check_out_lat DOUBLE PRECISION,
  check_out_lng DOUBLE PRECISION,
  status        TEXT DEFAULT 'present',
  is_late       BOOLEAN DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- ── gps_locations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gps_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  user_id     UUID REFERENCES users(id),
  latitude    NUMERIC(10,8) NOT NULL,
  longitude   NUMERIC(11,8) NOT NULL,
  accuracy    NUMERIC(6,2),
  status      VARCHAR(20) DEFAULT 'moving',
  is_offline  BOOLEAN DEFAULT false,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gps_locations ENABLE ROW LEVEL SECURITY;

-- ── production_recipes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  product_id  UUID REFERENCES products(id),
  recipe_name TEXT,
  batch_size  NUMERIC(14,2) DEFAULT 0,
  batch_unit  TEXT,
  notes       TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE production_recipes ENABLE ROW LEVEL SECURITY;

-- ── promo_banners ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_banners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  media_url     TEXT,
  media_type    TEXT DEFAULT 'image',
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE promo_banners ENABLE ROW LEVEL SECURITY;

-- ── deleted_invoices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deleted_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id),
  original_order_id UUID,
  order_number      TEXT,
  customer_name     TEXT,
  total_amount      NUMERIC(14,2),
  invoice_url       TEXT,
  original_data     JSONB,
  reason            TEXT,
  deleted_by        UUID,
  deleted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE deleted_invoices ENABLE ROW LEVEL SECURITY;

-- ── order_returns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id),
  order_id          UUID REFERENCES orders(id),
  customer_id       UUID REFERENCES users(id),
  order_item_id     UUID,
  product_name      TEXT,
  quantity_returned NUMERIC(10,2),
  item_condition    TEXT,
  amount_total      NUMERIC(14,2) DEFAULT 0,
  amount_returned   NUMERIC(14,2) DEFAULT 0,
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;

-- ── cheques ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cheques (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  recovery_id     UUID REFERENCES salesman_recoveries(id),
  cheque_number   TEXT,
  bank_name       TEXT,
  amount          NUMERIC(14,2),
  cheque_date     DATE,
  status          TEXT DEFAULT 'pending',
  cleared_at      TIMESTAMPTZ,
  returned_at     TIMESTAMPTZ,
  return_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;

-- ── bank_ledger_entries ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  bank_account_id UUID REFERENCES bank_accounts(id),
  entry_type      TEXT NOT NULL DEFAULT 'credit',
  amount          NUMERIC(14,2) NOT NULL,
  running_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  description     TEXT,
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bank_ledger_entries ENABLE ROW LEVEL SECURITY;

-- ── cash_closing_slips ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_closing_slips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  salesman_id     UUID REFERENCES salesmen(id),
  slip_date       DATE NOT NULL,
  total_cash      NUMERIC(14,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cash_closing_slips ENABLE ROW LEVEL SECURITY;

-- ── driver_recoveries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_recoveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  driver_id       UUID REFERENCES drivers(id),
  customer_id     UUID REFERENCES users(id),
  amount          NUMERIC(14,2) NOT NULL,
  payment_method  TEXT DEFAULT 'cash',
  notes           TEXT,
  recovery_date   DATE,
  status          TEXT DEFAULT 'pending',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE driver_recoveries ENABLE ROW LEVEL SECURITY;

-- ── admin_login_sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_login_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  company_id      UUID REFERENCES companies(id),
  token           TEXT,
  login_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at       TIMESTAMPTZ,
  login_latitude  NUMERIC,
  login_longitude NUMERIC,
  ended_reason    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ
);
ALTER TABLE admin_login_sessions ENABLE ROW LEVEL SECURITY;

-- ── promotions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  title       TEXT,
  description TEXT,
  discount    NUMERIC(5,2),
  valid_from  DATE,
  valid_to    DATE,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- ── categories ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES companies(id),
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ── manufacturing_heads ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manufacturing_heads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  full_name  TEXT NOT NULL,
  phone      TEXT,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE manufacturing_heads ENABLE ROW LEVEL SECURITY;

-- ── raw_material_stock_logs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_material_stock_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES raw_materials(id),
  company_id  UUID REFERENCES companies(id),
  quantity    NUMERIC NOT NULL,
  note        TEXT,
  supplier_name TEXT,
  purchase_id   UUID,
  price_per_unit NUMERIC,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE raw_material_stock_logs ENABLE ROW LEVEL SECURITY;

-- ── production_orders ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id),
  order_number TEXT,
  product_id   UUID REFERENCES products(id),
  product_name TEXT,
  unit         TEXT,
  qty          NUMERIC,
  batches      INTEGER DEFAULT 1,
  priority     TEXT DEFAULT 'normal',
  notes        TEXT,
  start_date   DATE DEFAULT CURRENT_DATE,
  status       TEXT DEFAULT 'pending',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;

-- ── productions ──────────────────────────────────────────────────
-- Manually created in old project (not in any phase file) — added here.
CREATE TABLE IF NOT EXISTS productions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id),
  recipe_id       UUID,
  finished_item_id UUID REFERENCES products(id),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  qty_produced    NUMERIC NOT NULL DEFAULT 0,
  wastage_qty     NUMERIC DEFAULT 0,
  wastage_unit    TEXT,
  remarks         TEXT,
  total_cost      NUMERIC(14,2) DEFAULT 0,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE productions ENABLE ROW LEVEL SECURITY;

-- ── production_bom ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_bom (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id),
  product_name TEXT NOT NULL,
  batch_size   NUMERIC DEFAULT 1,
  batch_unit   TEXT DEFAULT 'bag',
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE production_bom ENABLE ROW LEVEL SECURITY;

-- ── production_bom_items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_bom_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id          UUID REFERENCES production_bom(id) ON DELETE CASCADE,
  raw_material_id UUID REFERENCES raw_materials(id),
  qty_required    NUMERIC NOT NULL,
  unit            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE production_bom_items ENABLE ROW LEVEL SECURITY;

-- ── dispatches ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES companies(id),
  dispatch_number     TEXT,
  production_order_id UUID REFERENCES production_orders(id),
  product_name        TEXT,
  unit                TEXT,
  qty                 NUMERIC,
  destination         TEXT,
  driver              TEXT,
  notes               TEXT,
  status              TEXT DEFAULT 'in_transit',
  dispatched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id)
);
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;

-- ── stock_transfers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company_id UUID REFERENCES companies(id),
  to_company_id   UUID REFERENCES companies(id),
  product_id      UUID REFERENCES products(id),
  quantity        NUMERIC NOT NULL,
  status          TEXT DEFAULT 'pending',
  notes           TEXT,
  created_by      UUID,
  received_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at     TIMESTAMPTZ
);
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- ── unit_conversions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_conversions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES companies(id),
  raw_material_id  UUID REFERENCES raw_materials(id),
  purchase_unit    TEXT,
  consumption_unit TEXT,
  bag_weight       NUMERIC,
  bag_weight_unit  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE unit_conversions ENABLE ROW LEVEL SECURITY;

-- ── customer_product_prices ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_product_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES users(id),
  product_id  UUID REFERENCES products(id),
  company_id  UUID REFERENCES companies(id),
  price       NUMERIC(14,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_product_prices ENABLE ROW LEVEL SECURITY;

-- ── expense_account_payments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_account_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_account_id UUID REFERENCES expense_accounts(id),
  company_id        UUID REFERENCES companies(id),
  amount            NUMERIC(14,2) NOT NULL,
  notes             TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE expense_account_payments ENABLE ROW LEVEL SECURITY;

-- ── indexes for performance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_company       ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_salesman      ON users(salesman_id);
CREATE INDEX IF NOT EXISTS idx_orders_company      ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer     ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_recoveries_company  ON salesman_recoveries(company_id);
CREATE INDEX IF NOT EXISTS idx_recoveries_customer ON salesman_recoveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer     ON ledger_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company    ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_notif_recipient     ON notifications(recipient_id);
