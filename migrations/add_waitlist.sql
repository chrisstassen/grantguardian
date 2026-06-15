-- =============================================================================
-- Waitlist signups — collected from the marketing site pre-launch
-- =============================================================================

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL,
  org_name     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate email entries
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_idx ON waitlist_signups (lower(email));

-- RLS: unauthenticated visitors can insert but never read
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_waitlist" ON waitlist_signups
  FOR INSERT TO anon WITH CHECK (true);

-- To view signups, query directly from the Supabase dashboard (service role bypasses RLS):
-- SELECT * FROM waitlist_signups ORDER BY created_at DESC;
