-- =============================================================================
-- GrantGuardian — row-level security policies
--
-- Roles inside an organization:
--   admin  – everything in the org, manages members and invitations
--   staff  – creates and edits grant data
--   viewer – read only
-- System administrators (user_profiles.is_system_admin) see all support tickets,
-- organizations and users. Server routes that use the service-role key bypass
-- these policies and must do their own checks.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create policy "members and creator read organization" on public.organizations
  for select to authenticated
  using (id in (select public.get_user_org_ids()) or created_by = auth.uid() or public.is_system_admin());

create policy "logged-in users create organizations" on public.organizations
  for insert to authenticated
  with check (true);   -- guard trigger forces plan = starter and created_by = caller

create policy "org admins update organization" on public.organizations
  for update to authenticated
  using (id in (select public.get_user_admin_org_ids()) or public.is_system_admin());

-- ----------------------------------------------------------------------------
-- user_profiles
-- ----------------------------------------------------------------------------
create policy "read own, shared-org and admin profiles" on public.user_profiles
  for select to authenticated
  using (id = auth.uid()
         or id in (select public.get_org_member_user_ids())
         or public.is_system_admin()
         or public.user_is_system_admin(id));   -- support staff names show on tickets

create policy "users create own profile" on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());                 -- guard trigger blocks self-made admins

create policy "users update own profile" on public.user_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_system_admin())
  with check (id = auth.uid() or public.is_system_admin());

-- ----------------------------------------------------------------------------
-- user_organization_memberships
-- ----------------------------------------------------------------------------
create policy "read memberships of own orgs" on public.user_organization_memberships
  for select to authenticated
  using (user_id = auth.uid()
         or organization_id in (select public.get_user_org_ids())
         or public.is_system_admin());

create policy "join by invitation, as org creator, or added by admin" on public.user_organization_memberships
  for insert to authenticated
  with check (
    -- accepting a pending team invitation for this org and role
    (user_id = auth.uid() and public.has_pending_team_invitation(organization_id, role))
    -- first member of an organization you just created
    or (user_id = auth.uid() and role = 'admin'
        and public.org_created_by_me(organization_id)
        and not public.org_has_members(organization_id))
    -- an org admin adding someone
    or organization_id in (select public.get_user_admin_org_ids())
    or public.is_system_admin()
  );

create policy "org admins change roles" on public.user_organization_memberships
  for update to authenticated
  using (organization_id in (select public.get_user_admin_org_ids()) or public.is_system_admin())
  with check (organization_id in (select public.get_user_admin_org_ids()) or public.is_system_admin());

create policy "leave org or removed by admin" on public.user_organization_memberships
  for delete to authenticated
  using (user_id = auth.uid()
         or organization_id in (select public.get_user_admin_org_ids())
         or public.is_system_admin());

-- ----------------------------------------------------------------------------
-- team_invitations (lookups by token go through get_team_invitation())
-- ----------------------------------------------------------------------------
create policy "admins and invitee read invitations" on public.team_invitations
  for select to authenticated
  using (organization_id in (select public.get_user_admin_org_ids())
         or lower(invited_email) = public.current_user_email()
         or public.is_system_admin());

create policy "org admins create invitations" on public.team_invitations
  for insert to authenticated
  with check (organization_id in (select public.get_user_admin_org_ids()));

create policy "admins manage, invitee accepts" on public.team_invitations
  for update to authenticated
  using (organization_id in (select public.get_user_admin_org_ids())
         or lower(invited_email) = public.current_user_email())
  with check (organization_id in (select public.get_user_admin_org_ids())
              or (lower(invited_email) = public.current_user_email() and accepted_by_user_id = auth.uid()));

create policy "org admins delete invitations" on public.team_invitations
  for delete to authenticated
  using (organization_id in (select public.get_user_admin_org_ids()));

-- ----------------------------------------------------------------------------
-- system_admin_invitations
-- ----------------------------------------------------------------------------
create policy "system admins and invitee read" on public.system_admin_invitations
  for select to authenticated
  using (public.is_system_admin() or lower(invited_email) = public.current_user_email());

create policy "system admins invite" on public.system_admin_invitations
  for insert to authenticated
  with check (public.is_system_admin());

create policy "system admins manage, invitee accepts" on public.system_admin_invitations
  for update to authenticated
  using (public.is_system_admin() or lower(invited_email) = public.current_user_email())
  with check (public.is_system_admin()
              or (lower(invited_email) = public.current_user_email() and accepted_by_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- grants
-- ----------------------------------------------------------------------------
create policy "org members read grants" on public.grants
  for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

create policy "staff create grants" on public.grants
  for insert to authenticated
  with check (organization_id in (select public.get_user_editor_org_ids()));

create policy "staff update grants" on public.grants
  for update to authenticated
  using (organization_id in (select public.get_user_editor_org_ids()))
  with check (organization_id in (select public.get_user_editor_org_ids()));

create policy "org admins delete grants" on public.grants
  for delete to authenticated
  using (organization_id in (select public.get_user_admin_org_ids()));

-- ----------------------------------------------------------------------------
-- Tables that belong to a grant: members read, admin/staff write
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'expenses', 'budget_line_items', 'compliance_requirements', 'special_conditions',
    'payments_received', 'grant_deliverables', 'grant_funding_sources',
    'grant_closeout_items', 'grant_documents', 'reimbursement_requests'
  ] loop
    execute format($f$
      create policy "org members read %1$s" on public.%1$I
        for select to authenticated using (public.can_access_grant(grant_id));
      create policy "staff insert %1$s" on public.%1$I
        for insert to authenticated with check (public.can_edit_grant(grant_id));
      create policy "staff update %1$s" on public.%1$I
        for update to authenticated
        using (public.can_edit_grant(grant_id)) with check (public.can_edit_grant(grant_id));
      create policy "staff delete %1$s" on public.%1$I
        for delete to authenticated using (public.can_edit_grant(grant_id));
    $f$, t);
  end loop;
end $$;

-- Children of an expense
do $$
declare t text;
begin
  foreach t in array array['expense_documents', 'expense_budget_allocations'] loop
    execute format($f$
      create policy "org members read %1$s" on public.%1$I
        for select to authenticated using (exists (
          select 1 from public.expenses e where e.id = expense_id and public.can_access_grant(e.grant_id)));
      create policy "staff write %1$s" on public.%1$I
        for all to authenticated
        using (exists (
          select 1 from public.expenses e where e.id = expense_id and public.can_edit_grant(e.grant_id)))
        with check (exists (
          select 1 from public.expenses e where e.id = expense_id and public.can_edit_grant(e.grant_id)));
    $f$, t);
  end loop;
end $$;

-- Children of a reimbursement/grant request
create policy "org members read request expenses" on public.reimbursement_request_expenses
  for select to authenticated using (exists (
    select 1 from public.reimbursement_requests r
    where r.id = reimbursement_request_id and public.can_access_grant(r.grant_id)));
create policy "staff write request expenses" on public.reimbursement_request_expenses
  for all to authenticated
  using (exists (select 1 from public.reimbursement_requests r
                 where r.id = reimbursement_request_id and public.can_edit_grant(r.grant_id)))
  with check (exists (select 1 from public.reimbursement_requests r
                      where r.id = reimbursement_request_id and public.can_edit_grant(r.grant_id)));

create policy "org members read request attachments" on public.grant_request_attachments
  for select to authenticated using (exists (
    select 1 from public.reimbursement_requests r
    where r.id = request_id and public.can_access_grant(r.grant_id)));
create policy "staff write request attachments" on public.grant_request_attachments
  for all to authenticated
  using (exists (select 1 from public.reimbursement_requests r
                 where r.id = request_id and public.can_edit_grant(r.grant_id)))
  with check (exists (select 1 from public.reimbursement_requests r
                      where r.id = request_id and public.can_edit_grant(r.grant_id)));

-- ----------------------------------------------------------------------------
-- Grant notes, replies and recipients: members read; staff post;
-- only the author edits or deletes their own note/reply
-- ----------------------------------------------------------------------------
create policy "org members read grant notes" on public.grant_notes
  for select to authenticated using (public.can_access_grant(grant_id));
create policy "staff post grant notes" on public.grant_notes
  for insert to authenticated
  with check (created_by_user_id = auth.uid() and public.can_edit_grant(grant_id));
create policy "authors edit grant notes" on public.grant_notes
  for update to authenticated using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());
create policy "authors delete grant notes" on public.grant_notes
  for delete to authenticated using (created_by_user_id = auth.uid());

create policy "org members read note replies" on public.grant_note_replies
  for select to authenticated using (exists (
    select 1 from public.grant_notes n where n.id = note_id and public.can_access_grant(n.grant_id)));
create policy "staff post note replies" on public.grant_note_replies
  for insert to authenticated with check (
    created_by_user_id = auth.uid() and exists (
      select 1 from public.grant_notes n where n.id = note_id and public.can_edit_grant(n.grant_id)));
create policy "authors edit note replies" on public.grant_note_replies
  for update to authenticated using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid());
create policy "authors delete note replies" on public.grant_note_replies
  for delete to authenticated using (created_by_user_id = auth.uid());

create policy "org members read note recipients" on public.note_recipients
  for select to authenticated using (exists (
    select 1 from public.grant_notes n where n.id = note_id and public.can_access_grant(n.grant_id)));
create policy "note author adds recipients" on public.note_recipients
  for insert to authenticated with check (exists (
    select 1 from public.grant_notes n where n.id = note_id and n.created_by_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- Help chat: strictly private to each user
-- ----------------------------------------------------------------------------
create policy "users own help conversations" on public.help_conversations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users own help messages" on public.help_messages
  for all to authenticated
  using (exists (select 1 from public.help_conversations c
                 where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.help_conversations c
                      where c.id = conversation_id and c.user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- Support tickets: the submitter, their org's admins, and system admins
-- ----------------------------------------------------------------------------
create policy "submitter, org admins and support read tickets" on public.support_tickets
  for select to authenticated using (public.can_view_ticket(id));

create policy "members file tickets for their org" on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid() and organization_id in (select public.get_user_org_ids()));

create policy "submitter, org admins and support update tickets" on public.support_tickets
  for update to authenticated
  using (public.can_view_ticket(id)) with check (public.can_view_ticket(id));

create policy "read attachments on visible tickets" on public.support_ticket_attachments
  for select to authenticated using (public.can_view_ticket(ticket_id));
create policy "add attachments to visible tickets" on public.support_ticket_attachments
  for insert to authenticated
  with check (uploaded_by_user_id = auth.uid() and public.can_view_ticket(ticket_id));

-- Private notes are for GrantGuardian staff only
create policy "read ticket notes (private notes: support only)" on public.support_ticket_notes
  for select to authenticated
  using (public.is_system_admin() or (not is_private and public.can_view_ticket(ticket_id)));
create policy "add ticket notes" on public.support_ticket_notes
  for insert to authenticated
  with check (created_by_user_id = auth.uid()
              and public.can_view_ticket(ticket_id)
              and (not is_private or public.is_system_admin()));
create policy "authors edit ticket notes" on public.support_ticket_notes
  for update to authenticated using (created_by_user_id = auth.uid())
  with check (created_by_user_id = auth.uid() and (not is_private or public.is_system_admin()));
create policy "authors delete ticket notes" on public.support_ticket_notes
  for delete to authenticated using (created_by_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Notifications: you read and clear your own; you can notify people you work
-- with (shared org) and GrantGuardian support; support can notify anyone.
-- ----------------------------------------------------------------------------
create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "users mark own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
create policy "notify yourself, colleagues or support" on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid()
              or user_id in (select public.get_org_member_user_ids())
              or public.user_is_system_admin(user_id)
              or public.is_system_admin());

-- ----------------------------------------------------------------------------
-- Waitlist: anyone may sign up; nobody can read it from the browser
-- ----------------------------------------------------------------------------
create policy "anyone joins the waitlist" on public.waitlist_signups
  for insert to anon, authenticated with check (true);
