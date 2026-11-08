-- =============================================================================
-- GrantGuardian — remove signed-out (anon) table access and turn off GraphQL
--
-- Row-level policies already block signed-out visitors from every table. This
-- adds a second, independent lock: the anon role has no table permissions at
-- all, so a future policy mistake still can't expose data before login.
--
-- What signed-out visitors can still do:
--   - join the waitlist (insert only)
--   - call get_team_invitation / get_system_admin_invitation (signup page)
--
-- GraphQL is not used by the app; turning it off stops it listing table names.
-- =============================================================================

-- Existing tables, views and sequences
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant insert on public.waitlist_signups to anon;

-- Future tables and functions created by migrations get no anon access unless
-- a migration grants it explicitly.
alter default privileges for role postgres in schema public revoke all     on tables    from anon;
alter default privileges for role postgres in schema public revoke all     on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- GraphQL API (unused by GrantGuardian)
drop extension if exists pg_graphql;
