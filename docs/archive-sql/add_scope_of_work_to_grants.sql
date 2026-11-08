-- Migration: Add scope_of_work column to grants table
-- Run this in the Supabase SQL Editor

ALTER TABLE grants
ADD COLUMN IF NOT EXISTS scope_of_work text;
