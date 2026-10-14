-- ═══════════════════════════════════════════════════════════════
-- Phase 60 — Customer app home screen promo slider: admin-managed
-- images/videos that auto-slide in the middle of the customer app's
-- home screen.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promo_banners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id), -- NULL = shown to every branch
  media_url      TEXT NOT NULL,
  media_type     VARCHAR(10) NOT NULL DEFAULT 'image', -- 'image' | 'video'
  display_order  INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_banners_company ON promo_banners (company_id, is_active);

ALTER TABLE promo_banners ENABLE ROW LEVEL SECURITY;
