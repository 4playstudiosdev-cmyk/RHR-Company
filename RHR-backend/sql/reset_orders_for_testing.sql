-- ═══════════════════════════════════════════════════════════════
-- Full reset before real testing — clears every order and everything
-- derived from it (so customer ledgers/outstanding balances come back
-- clean too, not left with debit entries pointing at deleted orders).
--
-- IRREVERSIBLE. Run only when you actually want every order gone
-- across every branch. Children are deleted before orders itself to
-- respect foreign keys — if any DELETE below errors with
-- "relation ... does not exist", that table was never created in your
-- database (an earlier phase migration wasn't run) — just skip that
-- one line and continue with the rest.
-- ═══════════════════════════════════════════════════════════════

DELETE FROM order_returns;
DELETE FROM deleted_invoices;
DELETE FROM order_items;

-- Ledger entries an order itself created — the debit when it was
-- confirmed, its reversal if it was cancelled, and the credit if cash
-- was collected on delivery. Leaves untouched anything NOT tied to an
-- order: manual adjustments, salesman/driver cash recoveries, returns.
DELETE FROM ledger_entries WHERE reference_type IN ('order', 'delivery');

DELETE FROM notifications WHERE type = 'order';

DELETE FROM orders;
