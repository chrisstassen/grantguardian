-- Migration: Add percent_complete column to grants table
-- Run this in the Supabase SQL Editor

ALTER TABLE grants
ADD COLUMN IF NOT EXISTS percent_complete integer NOT NULL DEFAULT 0;

-- Optional: Add a check constraint to keep values between 0 and 100
ALTER TABLE grants
ADD CONSTRAINT grants_percent_complete_range
  CHECK (percent_complete >= 0 AND percent_complete <= 100);
