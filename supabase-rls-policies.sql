-- =============================================================================
-- GrantGuardian — Final RLS Policies (SECURITY DEFINER approach)
--
-- The previous approach caused infinite recursion (PostgreSQL error 42P17) because
-- policies containing subqueries on user_organization_memberships triggered RLS
-- evaluation on that same table, creating a recursive chain.
--
-- Fix: SECURITY DEFINER helper functions query user_organization_memberships
-- WITHOUT RLS applied, so policies that call these functions never recurse.
--
-- Run the entire script at once in the Supabase SQL Editor.
-- Safe to re-run (uses DROP IF EXISTS throughout).
-- =============================================================================


-- =============================================================================
-- STEP 1: Helper functions (SECURITY DEFINER = bypasses RLS when called)
-- =============================================================================

-- Returns organization IDs the current user belongs to
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM user_organization_memberships
  WHERE user_id = auth.uid()
$$;

-- Returns organization IDs where the current user is an admin
CREATE OR REPLACE FUNCTION public.get_user_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM user_organization_memberships
  WHERE user_id = auth.uid() AND role = 'admin'
$$;

-- Returns user IDs of all members who share at least one org with the current user
CREATE OR REPLACE FUNCTION public.get_org_member_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT user_id
  FROM user_organization_memberships
  WHERE organization_id IN (
    SELECT organization_id FROM user_organization_memberships WHERE user_id = auth.uid()
  )
$$;


-- =============================================================================
-- STEP 2: Drop ALL existing policies
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- =============================================================================
-- STEP 3: Recreate all policies using helper functions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USER_ORGANIZATION_MEMBERSHIPS
-- Simple, no self-reference — these are the only policies safe to keep direct
-- ---------------------------------------------------------------------------
CREATE POLICY "users_select_own_memberships" ON user_organization_memberships
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_membership" ON user_organization_memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_membership" ON user_organization_memberships
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_read_organizations" ON organizations
  FOR SELECT USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "org_admins_update_organizations" ON organizations
  FOR UPDATE USING (id IN (SELECT get_user_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- USER_PROFILES
-- ---------------------------------------------------------------------------

-- Users can always read and update their own profile
CREATE POLICY "users_select_own_profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_insert_own_profile" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- Org members can read profiles of people in their shared org
CREATE POLICY "org_members_read_profiles" ON user_profiles
  FOR SELECT USING (id IN (SELECT get_org_member_user_ids()));

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_grants" ON grants
  FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- ---------------------------------------------------------------------------
-- EXPENSES
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_expenses" ON expenses
  FOR ALL
  USING (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- EXPENSE_DOCUMENTS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_expense_documents" ON expense_documents
  FOR ALL
  USING (
    expense_id IN (
      SELECT id FROM expenses WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  )
  WITH CHECK (
    expense_id IN (
      SELECT id FROM expenses WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- COMPLIANCE_REQUIREMENTS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_compliance_requirements" ON compliance_requirements
  FOR ALL
  USING (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- SPECIAL_CONDITIONS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_special_conditions" ON special_conditions
  FOR ALL
  USING (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- PAYMENTS_RECEIVED
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_payments_received" ON payments_received
  FOR ALL
  USING (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- GRANT_NOTES
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_grant_notes" ON grant_notes
  FOR ALL
  USING (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    grant_id IN (
      SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- GRANT_NOTE_REPLIES
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_grant_note_replies" ON grant_note_replies
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM grant_notes WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  )
  WITH CHECK (
    note_id IN (
      SELECT id FROM grant_notes WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- NOTE_RECIPIENTS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_note_recipients" ON note_recipients
  FOR ALL
  USING (
    note_id IN (
      SELECT id FROM grant_notes WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  )
  WITH CHECK (
    note_id IN (
      SELECT id FROM grant_notes WHERE grant_id IN (
        SELECT id FROM grants WHERE organization_id IN (SELECT get_user_org_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- SUPPORT_TICKETS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_support_tickets" ON support_tickets
  FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- ---------------------------------------------------------------------------
-- SUPPORT_TICKET_NOTES
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_support_ticket_notes" ON support_ticket_notes
  FOR ALL
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- SUPPORT_TICKET_ATTACHMENTS
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_all_support_ticket_attachments" ON support_ticket_attachments
  FOR ALL
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE organization_id IN (SELECT get_user_org_ids())
    )
  )
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE POLICY "users_all_own_notifications" ON notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
