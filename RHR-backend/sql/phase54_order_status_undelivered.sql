-- CRITICAL — orders.status is a Postgres ENUM (order_status), not a
-- plain text column. The driver delivery workflow added 'undelivered'
-- as a status value in application code (orders.service.js) without
-- this migration, which meant every GET /orders for a driver role has
-- been throwing "invalid input value for enum order_status:
-- 'undelivered'" and returning nothing — this is why dispatched orders
-- never appeared in the driver app at all, not just the Cancel button.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'undelivered';
