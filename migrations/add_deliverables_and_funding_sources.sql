-- Migration: Add grant_deliverables and grant_funding_sources tables,
-- and total_project_cost column on grants.
-- Run this in the Supabase SQL Editor.

-- 1. Deliverables
CREATE TABLE IF NOT EXISTS grant_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES grants(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  unit text,                         -- e.g. "people served", "training sessions", "units"
  target_value numeric,
  actual_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started',  -- not_started | in_progress | completed
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Funding Sources
CREATE TABLE IF NOT EXISTS grant_funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid REFERENCES grants(id) ON DELETE CASCADE NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL DEFAULT 'other',
    -- federal | state | local | insurance | organization_budget | donation | other
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Total project cost on grants (optional — may differ from award_amount)
ALTER TABLE grants
ADD COLUMN IF NOT EXISTS total_project_cost numeric;
