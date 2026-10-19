-- ═══════════════════════════════════════════════════════════════
-- Fix: "duplicate key value violates unique constraint orders_order_number_key"
-- when creating an order (admin, salesman and customer — every new order).
--
-- Cause: the database numbers orders itself (KHI-2026-00007...) with a
-- trigger that looks at how MANY orders exist (count + 1). Orders 2 and 4
-- were deleted, so 5 orders remain and the next number is "6" — which is
-- already taken by KHI-2026-00006, so every new order was rejected.
--
-- This replaces that numbering with one that can never collide: the next
-- number is one more than the highest number ever handed out for that
-- branch + year (kept in order_number_counters, so a number is not reused
-- even if its order is later deleted — old ledger lines that say
-- "Order KHI-2026-00015" keep pointing at one order only).
-- Format is unchanged: <branch city>-<year>-<5 digits>, e.g. KHI-2026-00008.
--
-- Safe to run more than once. Run it once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS order_number_counters (
  prefix     TEXT PRIMARY KEY,          -- e.g. 'KHI-2026-'
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION rhr_assign_order_number() RETURNS trigger AS $fn$
DECLARE
  v_city   TEXT;
  v_prefix TEXT;
  v_max    INTEGER;
  v_next   INTEGER;
BEGIN
  SELECT NULLIF(TRIM(city), '') INTO v_city FROM companies WHERE id = NEW.company_id;
  v_prefix := UPPER(COALESCE(v_city, 'RHR')) || '-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Karachi', 'YYYY') || '-';

  -- one order number at a time per branch+year, so two orders placed in the
  -- same instant can't get the same number
  PERFORM pg_advisory_xact_lock(HASHTEXT(v_prefix));

  SELECT COALESCE(MAX(SUBSTRING(order_number FROM '([0-9]+)$')::INTEGER), 0)
    INTO v_max
    FROM orders
   WHERE order_number LIKE v_prefix || '%'
     AND order_number ~ ('^' || v_prefix || '[0-9]+$');

  INSERT INTO order_number_counters (prefix, last_value)
       VALUES (v_prefix, v_max + 1)
  ON CONFLICT (prefix) DO UPDATE
        SET last_value = GREATEST(order_number_counters.last_value, v_max) + 1
  RETURNING last_value INTO v_next;

  NEW.order_number := v_prefix || LPAD(v_next::TEXT, 5, '0');
  RETURN NEW;
END
$fn$ LANGUAGE plpgsql;

-- Remove whichever existing trigger(s) on orders were setting order_number
-- (their names aren't in the repo), then install the new one.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'public.orders'::regclass
       AND NOT t.tgisinternal
       AND p.proname <> 'rhr_assign_order_number'
       AND p.prosrc ILIKE '%order_number%'
  LOOP
    RAISE NOTICE 'Dropping old order-number trigger: %', r.tgname;
    EXECUTE format('DROP TRIGGER %I ON public.orders', r.tgname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_rhr_assign_order_number ON orders;
CREATE TRIGGER trg_rhr_assign_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION rhr_assign_order_number();

-- Check: this should list exactly one trigger that touches order_number.
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;
