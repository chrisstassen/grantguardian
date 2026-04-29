-- Migration: Add Reimbursement Request tracking tables
-- Run this in the Supabase SQL Editor.

-- 1. Main reimbursement requests table
CREATE TABLE IF NOT EXISTS reimbursement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_number text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending_submission',
  CONSTRAINT rr_status_check CHECK (
    status IN ('pending_submission', 'submitted', 'payment_received', 'request_denied')
  ),
  submitted_date date,
  -- When status = payment_received, optionally link to a payment record.
  -- Multiple requests can point to the same payment (many→one).
  payment_received_id uuid REFERENCES payments_received(id) ON DELETE SET NULL,
  notes text,
  created_by_user_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Junction table: links individual expenses to a reimbursement request
--    An expense may only be linked to one request at a time.
CREATE TABLE IF NOT EXISTS reimbursement_request_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_request_id uuid NOT NULL REFERENCES reimbursement_requests(id) ON DELETE CASCADE,
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(expense_id)  -- each expense can only belong to one request
);

-- 3. Enable Row Level Security
ALTER TABLE reimbursement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reimbursement_request_expenses ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for reimbursement_requests

-- All org members can view
CREATE POLICY "org_members_view_rr" ON reimbursement_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM user_organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Editors and admins can insert
CREATE POLICY "editors_insert_rr" ON reimbursement_requests
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organization_memberships
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Editors and admins can update
CREATE POLICY "editors_update_rr" ON reimbursement_requests
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM user_organization_memberships
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

-- Admins can delete
CREATE POLICY "admins_delete_rr" ON reimbursement_requests
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM user_organization_memberships
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 5. RLS policies for reimbursement_request_expenses

CREATE POLICY "org_members_view_rre" ON reimbursement_request_expenses
  FOR SELECT USING (
    reimbursement_request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "editors_insert_rre" ON reimbursement_request_expenses
  FOR INSERT WITH CHECK (
    reimbursement_request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );

CREATE POLICY "editors_delete_rre" ON reimbursement_request_expenses
  FOR DELETE USING (
    reimbursement_request_id IN (
      SELECT id FROM reimbursement_requests WHERE organization_id IN (
        SELECT organization_id FROM user_organization_memberships
        WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
      )
    )
  );
