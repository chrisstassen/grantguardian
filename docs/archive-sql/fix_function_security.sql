-- =============================================================================
-- Fix: Function security hardening
-- Resolves all Supabase security advisor warnings:
--   - function_search_path_mutable (3 functions)
--   - anon_security_definer_function_executable (6 functions)
--   - authenticated_security_definer_function_executable (trigger functions)
-- Run this in the Supabase SQL Editor.
-- =============================================================================


-- =============================================================================
-- PART 1: Fix mutable search_path on trigger functions
--
-- These three functions were created without SET search_path = public, which
-- means a malicious user could manipulate search_path to shadow pg_catalog
-- functions and affect function behaviour.
--
-- ALTER FUNCTION ... SET search_path fixes this without rewriting the body.
-- =============================================================================

ALTER FUNCTION public.sync_user_email()        SET search_path = public;
ALTER FUNCTION public.sync_new_user_email()    SET search_path = public;
ALTER FUNCTION public.notify_mentioned_users() SET search_path = public;


-- =============================================================================
-- PART 2: Revoke direct execution of trigger-only functions
--
-- sync_user_email, sync_new_user_email, and notify_mentioned_users are fired
-- by database triggers — they are never meant to be called directly via the
-- PostgREST RPC API (/rest/v1/rpc/...). Revoking EXECUTE from anon and
-- authenticated closes that surface completely. Triggers always run under the
-- trigger owner (postgres), so trigger behaviour is unaffected.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.sync_user_email()        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_new_user_email()    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_mentioned_users() FROM anon, authenticated;


-- =============================================================================
-- PART 3: Revoke anon access to RLS helper functions
--
-- get_user_org_ids, get_user_admin_org_ids, get_org_member_user_ids, and
-- is_system_admin are SECURITY DEFINER helpers used inside RLS policies.
-- Authenticated users must keep EXECUTE so that RLS policy evaluation works
-- correctly when a signed-in user queries any protected table.
-- Anonymous users should never trigger these helpers — revoking anon access
-- blocks unauthenticated REST calls to /rest/v1/rpc/<function> without
-- affecting any legitimate use.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_user_org_ids()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_admin_org_ids()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_org_member_user_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_system_admin()         FROM anon;


-- =============================================================================
-- PART 4: Revoke authenticated direct access to get_* helpers (optional but
-- recommended — authenticated users should use the app, not raw RPC calls)
--
-- NOTE: Only run this block if you have confirmed that no part of the
-- application calls these functions directly via supabase.rpc(). In this
-- project all DB access goes through supabaseAdmin server-side routes or
-- the Supabase JS client with RLS enforced — none of these helpers are called
-- via rpc() from the client. Revoking prevents authenticated users from
-- harvesting org membership data by calling /rest/v1/rpc/get_user_org_ids
-- directly.
--
-- RLS policies call these functions as part of query planning — that still
-- works because PostgreSQL evaluates RLS with the function owner's privileges
-- (SECURITY DEFINER), not the caller's role.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_user_org_ids()        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_admin_org_ids()  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_org_member_user_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_system_admin()         FROM authenticated;


-- =============================================================================
-- Verification (optional — run separately to confirm)
-- =============================================================================
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.role_routine_grants
-- WHERE specific_schema = 'public'
--   AND routine_name IN (
--     'sync_user_email', 'sync_new_user_email', 'notify_mentioned_users',
--     'get_user_org_ids', 'get_user_admin_org_ids',
--     'get_org_member_user_ids', 'is_system_admin'
--   )
-- ORDER BY routine_name, grantee;
