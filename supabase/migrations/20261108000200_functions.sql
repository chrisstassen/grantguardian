-- =============================================================================
-- GrantGuardian — helper functions, guard triggers and RPCs
--
-- The access helpers are SECURITY DEFINER so row-level policies can call them
-- without recursing into user_organization_memberships' own policies (the
-- 42P17 "infinite recursion" problem from April). They only ever answer
-- questions about the *calling* user, so exposing them to logged-in users is safe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Access helpers (used by RLS policies)
-- -----------------------------------------------------------------------------

create or replace function public.current_user_email()
returns text language sql stable set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select is_system_admin from public.user_profiles where id = auth.uid()), false)
$$;

create or replace function public.get_user_org_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select organization_id from public.user_organization_memberships where user_id = auth.uid()
$$;

create or replace function public.get_user_admin_org_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select organization_id from public.user_organization_memberships
  where user_id = auth.uid() and role = 'admin'
$$;

-- Orgs where the user may create/edit records (admin or staff; not viewer)
create or replace function public.get_user_editor_org_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select organization_id from public.user_organization_memberships
  where user_id = auth.uid() and role in ('admin', 'staff')
$$;

-- Everyone who shares at least one organization with the caller
create or replace function public.get_org_member_user_ids()
returns setof uuid language sql stable security definer set search_path = ''
as $$
  select distinct m.user_id
  from public.user_organization_memberships m
  where m.organization_id in (
    select organization_id from public.user_organization_memberships where user_id = auth.uid())
$$;

create or replace function public.can_access_grant(p_grant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.grants g
    join public.user_organization_memberships m on m.organization_id = g.organization_id
    where g.id = p_grant_id and m.user_id = auth.uid())
$$;

create or replace function public.can_edit_grant(p_grant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.grants g
    join public.user_organization_memberships m on m.organization_id = g.organization_id
    where g.id = p_grant_id and m.user_id = auth.uid() and m.role in ('admin', 'staff'))
$$;

-- A user can see a ticket if they filed it, administer its org, or are a system admin
create or replace function public.can_view_ticket(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_system_admin() or exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket_id
      and (t.user_id = auth.uid()
           or t.organization_id in (
             select organization_id from public.user_organization_memberships
             where user_id = auth.uid() and role = 'admin')))
$$;

-- True if another user is a system admin (used to let anyone notify support staff)
create or replace function public.user_is_system_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_system_admin from public.user_profiles where id = p_user_id), false)
$$;

-- Membership-insert checks (security definer so they can read across RLS)
create or replace function public.org_has_members(p_org_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_organization_memberships where organization_id = p_org_id) $$;

create or replace function public.org_created_by_me(p_org_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.organizations where id = p_org_id and created_by = auth.uid()) $$;

create or replace function public.has_pending_team_invitation(p_org_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_invitations
    where organization_id = p_org_id and role = p_role and status = 'pending'
      and expires_at > now() and lower(invited_email) = public.current_user_email())
$$;

-- -----------------------------------------------------------------------------
-- Guard trigger: nobody can grant themselves system-admin, and only system
-- admins (or the server) can change an organization's plan.
-- Server code using the service-role key is not restricted.
-- -----------------------------------------------------------------------------

create or replace function public.guard_user_profiles()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;  -- server-side code and SQL editor
  end if;

  if tg_op = 'INSERT' and new.is_system_admin then
    -- Allowed only when accepting a valid system-admin invitation for this email
    if not exists (
      select 1 from public.system_admin_invitations
      where lower(invited_email) = public.current_user_email()
        and lower(invited_email) = lower(coalesce(new.email, ''))
        and status = 'pending' and expires_at > now()
    ) then
      raise exception 'Not allowed to create a system administrator profile';
    end if;
  elsif tg_op = 'UPDATE' and new.is_system_admin is distinct from old.is_system_admin then
    if not public.is_system_admin() then
      raise exception 'Only system administrators can change administrator status';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_user_profiles
before insert or update on public.user_profiles
for each row execute function public.guard_user_profiles();

create or replace function public.guard_organization_plan()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'starter';         -- new orgs always start on Starter
    new.created_by := auth.uid();
  elsif new.plan is distinct from old.plan and not public.is_system_admin() then
    raise exception 'Only system administrators can change an organization''s plan';
  elsif new.invite_code is distinct from old.invite_code
        or new.created_by is distinct from old.created_by then
    if not public.is_system_admin() then
      raise exception 'These organization fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_organization_plan
before insert or update on public.organizations
for each row execute function public.guard_organization_plan();

-- -----------------------------------------------------------------------------
-- Keep user_profiles.email in step with the login email
-- -----------------------------------------------------------------------------

create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.user_profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_user_email();

-- -----------------------------------------------------------------------------
-- RPCs called by the app
-- -----------------------------------------------------------------------------

-- Look up a team invitation by its token (signup/login pages, before or after login).
-- Returns only what the page needs; never lists other invitations.
create or replace function public.get_team_invitation(p_token text)
returns table (id uuid, organization_id uuid, organization_name text, invited_email text,
               role text, status text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.organization_id, o.name, i.invited_email, i.role, i.status, i.expires_at
  from public.team_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token
$$;

create or replace function public.get_system_admin_invitation(p_token text)
returns table (id uuid, invited_email text, status text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select id, invited_email, status, expires_at
  from public.system_admin_invitations
  where token = p_token
$$;

-- Organization picker on the onboarding "join" screen: names only, no invite codes
create or replace function public.list_organizations_for_join()
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$ select id, name from public.organizations order by name $$;

-- Join an organization with its invite code. The code is checked here, on the
-- server, so it never has to be readable by the browser.
create or replace function public.join_organization_with_code(p_org_id uuid, p_invite_code text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be logged in';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_org_id and upper(invite_code) = upper(trim(coalesce(p_invite_code, '')))
  ) then
    raise exception 'Invalid invite code';
  end if;
  insert into public.user_organization_memberships (user_id, organization_id, role, is_primary)
  values (auth.uid(), p_org_id, 'staff',
          not exists (select 1 from public.user_organization_memberships where user_id = auth.uid()))
  on conflict (user_id, organization_id) do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Who may call what
-- -----------------------------------------------------------------------------
revoke all on function
  public.is_system_admin(), public.get_user_org_ids(), public.get_user_admin_org_ids(),
  public.get_user_editor_org_ids(), public.get_org_member_user_ids(),
  public.can_access_grant(uuid), public.can_edit_grant(uuid), public.can_view_ticket(uuid),
  public.user_is_system_admin(uuid), public.org_has_members(uuid), public.org_created_by_me(uuid),
  public.has_pending_team_invitation(uuid, text), public.current_user_email(),
  public.list_organizations_for_join(), public.join_organization_with_code(uuid, text),
  public.get_team_invitation(text), public.get_system_admin_invitation(text)
from public, anon;

-- Policy helpers must be executable by logged-in users, or every policy fails
grant execute on function
  public.is_system_admin(), public.get_user_org_ids(), public.get_user_admin_org_ids(),
  public.get_user_editor_org_ids(), public.get_org_member_user_ids(),
  public.can_access_grant(uuid), public.can_edit_grant(uuid), public.can_view_ticket(uuid),
  public.user_is_system_admin(uuid), public.org_has_members(uuid), public.org_created_by_me(uuid),
  public.has_pending_team_invitation(uuid, text), public.current_user_email(),
  public.list_organizations_for_join(), public.join_organization_with_code(uuid, text),
  public.get_team_invitation(text), public.get_system_admin_invitation(text)
to authenticated;

-- Invitation lookups also run on the signup page before the account exists
grant execute on function public.get_team_invitation(text), public.get_system_admin_invitation(text)
to anon;

-- Trigger functions are never called directly
revoke all on function
  public.set_updated_at(), public.guard_user_profiles(), public.guard_organization_plan(),
  public.sync_user_email()
from public, anon, authenticated;
