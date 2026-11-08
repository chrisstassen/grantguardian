-- Grant Close-Out Checklist
CREATE TABLE IF NOT EXISTS grant_closeout_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id            UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  category            TEXT NOT NULL DEFAULT 'General',
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'not_applicable')),
  due_date            DATE,
  assigned_to_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  notes               TEXT,
  ai_generated        BOOLEAN NOT NULL DEFAULT FALSE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_closeout_items_grant_id ON grant_closeout_items(grant_id);

-- RLS
ALTER TABLE grant_closeout_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read closeout items"
  ON grant_closeout_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_closeout_items.grant_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "org non-viewers can write closeout items"
  ON grant_closeout_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM grants g
      JOIN user_organization_memberships m ON m.organization_id = g.organization_id
      WHERE g.id = grant_closeout_items.grant_id
        AND m.user_id = auth.uid()
        AND m.role != 'viewer'
    )
  );
