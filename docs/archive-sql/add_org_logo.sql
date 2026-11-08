-- Add organization logo support
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_path TEXT,
  ADD COLUMN IF NOT EXISTS logo_name TEXT;

-- Storage bucket 'organization-logos' must be created manually in Supabase (Private).
-- Suggested RLS for the bucket:
--   SELECT: authenticated users whose org membership matches the org ID in the path prefix
--   INSERT/UPDATE/DELETE: admin members only
--
-- The server-side API routes use the service role key (supabaseAdmin) and bypass RLS.
