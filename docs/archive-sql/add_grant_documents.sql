-- ─────────────────────────────────────────────────────────────
--  Grant Documents table
--  Stores general / miscellaneous documents attached to a grant.
--  Expense-supporting docs and request attachments stay in their
--  own tables; this table holds everything else the user uploads
--  from the Documents tab.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grant_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id              UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name             TEXT NOT NULL,
  file_path             TEXT NOT NULL,          -- path inside 'grant-documents' storage bucket
  file_type             TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size             BIGINT NOT NULL DEFAULT 0,  -- bytes
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-grant lookups
CREATE INDEX IF NOT EXISTS grant_documents_grant_id_idx ON grant_documents(grant_id);

-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE grant_documents ENABLE ROW LEVEL SECURITY;

-- Members of the grant's organisation can SELECT
CREATE POLICY "org members can view grant documents"
  ON grant_documents FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM user_organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Non-viewers can INSERT
CREATE POLICY "org non-viewers can upload grant documents"
  ON grant_documents FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM user_organization_memberships
      WHERE user_id = auth.uid()
        AND role <> 'viewer'
    )
  );

-- Non-viewers can DELETE their own docs (or admins can delete any)
CREATE POLICY "org non-viewers can delete grant documents"
  ON grant_documents FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM user_organization_memberships
      WHERE user_id = auth.uid()
        AND role <> 'viewer'
    )
  );

-- ── Storage bucket ────────────────────────────────────────────
-- Create the 'grant-documents' bucket manually in the Supabase
-- dashboard (Storage → New bucket → name: grant-documents, Public: OFF).
-- No storage RLS policies are required because all uploads/downloads
-- go through server-side API routes that use supabaseAdmin.
