-- ═══════════════════════════════════════════════════════════════
-- Phase 62 — Defensive safety net for ledger_entries.created_by's FK to
-- users(id). An existing DB trigger (payments.service.js's reviewPayment
-- comment: "ledger CREDIT entry is auto-created by DB trigger on
-- approval") inserts a ledger_entries row whose created_by can end up
-- holding a salesman's id — salesmen live in a separate `salesmen`
-- table, not `users`, so that insert 23503s (seen live: "Key
-- (created_by)=(<salesman id>) is not present in table users").
--
-- Rather than hunt down and patch that trigger's definition (not
-- tracked in this repo — created directly in Supabase), this adds a
-- BEFORE INSERT trigger on ledger_entries itself that nulls out any
-- created_by value that isn't an actual users(id) row, regardless of
-- which code path or trigger produced it. Mirrors the "null is fine
-- for a salesman/driver-originated entry" pattern already used
-- throughout orders.service.js and recovery.routes.js.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sanitize_ledger_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by) THEN
    NEW.created_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sanitize_ledger_created_by ON ledger_entries;
CREATE TRIGGER trg_sanitize_ledger_created_by
BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION sanitize_ledger_created_by();
