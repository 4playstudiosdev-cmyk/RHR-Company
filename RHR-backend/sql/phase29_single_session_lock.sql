-- Single-session-per-admin-account lock: prevents the same admin login
-- (super_admin or branch_admin) from being active on two desktops at
-- once. A login sets these; POST /auth/logout clears them; they also
-- self-expire after SESSION_MAX_AGE_MS (8h, matching the frontend's own
-- session-expiry assumption in App.js) so a browser closed without
-- logging out doesn't lock the account out forever.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_session_token TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_session_started_at TIMESTAMPTZ;
