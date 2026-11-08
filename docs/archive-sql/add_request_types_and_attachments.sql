-- Migration: Extend reimbursement_requests with multi-type support
-- and add grant_request_attachments table for file uploads.
-- Run this in the Supabase SQL Editor.

-- 1. Add request_type column (defaults to 'reimbursement' for existing rows)
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'reimbursement';

ALTER TABLE reimbursement_requests
  DROP CONSTRAINT IF EXISTS rr_request_type_check;

ALTER TABLE reimbursement_requests
  ADD CONSTRAINT rr_request_type_check CHECK (
    request_type IN (
      'reimbursement',
      'request_for_information',
      'appeal',
      'time_extension',
      'scope_budget_change',
      'closeout'
    )
  );

-- 2. Add type_data JSONB column to store type-specific fields
ALTER TABLE reimbursement_requests
  ADD COLUMN IF NOT EXISTS type_data jsonb;

-- 3. Attachments table for non-reimbursement request types
--    (Reimbursement requests use expense_documents instead)
CREATE TABLE IF NOT EXISTS grant_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES user_profiles(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS on grant_request_attachments
ALTER TABLE grant_request_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_view_gra" ON grant_request_attachments
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "editors_insert_gra" ON grant_request_attachments
  FOR INSERT WITH CHECK (
    request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

CREATE POLICY "editors_delete_gra" ON grant_request_attachments
  FOR DELETE USING (
    request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

-- 5. Create the Supabase storage bucket for request attachments.
--    NOTE: You must also create the bucket manually in Supabase:
--    Storage → New bucket → Name: "grant-request-attachments" → Public: off
