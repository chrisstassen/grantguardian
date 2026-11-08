-- Migration: Add grant_deliverables and grant_funding_sources tables,
-- and total_project_cost column on grants.
-- Run this in the Supabase SQL Editor.

-- 1. Deliverables
CREATE TABLE IF NOT EXISTS grant_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES grants(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  unit text,                         -- e.g. "people served", "training sessions", "units"
  target_value numeric,
  actual_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started',  -- not_started | in_progress | completed
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Funding Sources
CREATE TABLE IF NOT EXISTS grant_funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES grants(id) ON DELETE CASCADE NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'other',
    -- federal | state | local | insurance | organization_budget | donation | other
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Total project cost on grants (optional — may differ from award_amount)
ALTER TABLE grants
ADD COLUMN IF NOT EXISTS total_project_cost numeric;

-- 4. RLS
ALTER TABLE grant_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE grant_funding_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read deliverables"
  ON grant_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org non-viewers can insert deliverables"
  ON grant_deliverables FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can update deliverables"
  ON grant_deliverables FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can delete deliverables"
  ON grant_deliverables FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_deliverables.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );

CREATE POLICY "org members can read funding sources"
  ON grant_funding_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org non-viewers can insert funding sources"
  ON grant_funding_sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can update funding sources"
  ON grant_funding_sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );

CREATE POLICY "org non-viewers can delete funding sources"
  ON grant_funding_sources FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_funding_sources.grant_id AND m.user_id = auth.uid() AND m.role != 'viewer'
    )
  );
