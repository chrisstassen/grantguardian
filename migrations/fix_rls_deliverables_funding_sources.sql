-- Fix: Enable RLS on grant_deliverables and grant_funding_sources
-- These tables were created without RLS enabled.
-- Run this in the Supabase SQL Editor immediately.

-- ── grant_deliverables ────────────────────────────────────────────────────────

ALTER TABLE grant_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read deliverables"
  ON grant_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org non-viewers can insert deliverables"
  ON grant_deliverables FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can update deliverables"
  ON grant_deliverables FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can delete deliverables"
  ON grant_deliverables FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );

-- ── grant_funding_sources ─────────────────────────────────────────────────────

ALTER TABLE grant_funding_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read funding sources"
  ON grant_funding_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org non-viewers can insert funding sources"
  ON grant_funding_sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can update funding sources"
  ON grant_funding_sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can delete funding sources"
  ON grant_funding_sources FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );
