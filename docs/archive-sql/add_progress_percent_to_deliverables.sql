-- Migration: Add progress_percent column to grant_deliverables
-- Run this in the Supabase SQL Editor.

ALTER TABLE grant_deliverables
ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0;

ALTER TABLE grant_deliverables
ADD CONSTRAINT deliverables_progress_percent_range
  CHECK (progress_percent >= 0 AND progress_percent <= 100);
