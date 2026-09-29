-- Full login/logout history for admin accounts (super_admin/branch_admin),
-- not just the single "currently locked or not" flag users.active_session_*
-- already had (phase29). Each row is one session: when it started, where
-- from (if location was shared), when/why it ended. Answers "when did X
-- log in, from where, and when did they log out" — not just "are they
-- locked right now".
CREATE TABLE IF NOT EXISTS admin_login_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  company_id      UUID REFERENCES companies(id),
  login_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at       TIMESTAMPTZ,
  login_latitude  NUMERIC,
  login_longitude NUMERIC,
  ended_reason    VARCHAR(30), -- 'logout' | 'force_login_override' | 'force_logout_by_admin' | 'expired'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_sessions_user ON admin_login_sessions (user_id, login_at DESC);

ALTER TABLE admin_login_sessions ENABLE ROW LEVEL SECURITY;
