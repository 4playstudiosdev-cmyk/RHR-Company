-- One-off: insert a real, pending leave request for "Sami Salesman" so
-- the new Leave Management board (HRM → Leave) has something to show.
-- Not a numbered phase file — this is sample data, not a schema change.
-- Safe to run more than once (it'll just add another request each time).

INSERT INTO leave_requests (company_id, user_id, leave_type, from_date, to_date, total_days, reason, status, created_at)
SELECT
  company_id,
  id,
  'casual',
  CURRENT_DATE + INTERVAL '4 days',
  CURRENT_DATE + INTERVAL '6 days',
  3,
  'Family emergency requires immediate travel out of city. Will be reachable via phone for urgent matters.',
  'pending',
  NOW()
FROM salesmen
WHERE full_name ILIKE '%sami%'
LIMIT 1;

-- Optional: also add one already-approved request, so you can see both
-- the "Pending" and "Approved" tabs populated. Uncomment to run it too.

-- INSERT INTO leave_requests (company_id, user_id, leave_type, from_date, to_date, total_days, reason, status, created_at)
-- SELECT
--   company_id,
--   id,
--   'annual',
--   CURRENT_DATE - INTERVAL '20 days',
--   CURRENT_DATE - INTERVAL '10 days',
--   11,
--   'Annual family trip.',
--   'approved',
--   NOW() - INTERVAL '25 days'
-- FROM salesmen
-- WHERE full_name ILIKE '%sami%'
-- LIMIT 1;
