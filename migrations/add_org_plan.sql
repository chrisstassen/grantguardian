-- =============================================================================
-- Add subscription plan to organizations
-- =============================================================================
-- plan: 'starter' (default) | 'pro'
-- Limits enforced by the application:
--   starter: max 5 active grants, max 5 team members, no AI features
--   pro:     unlimited grants, unlimited members, AI assistant + AI closeout

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter'
  CHECK (plan IN ('starter', 'pro'));

-- Upgrade specific orgs to Pro (run manually when a customer pays):
-- UPDATE organizations SET plan = 'pro' WHERE id = '<org-uuid>';
