-- Migration 0002: Add case_diary_date column to case_diaries.
-- Nullable — existing rows keep NULL; new diaries can carry an explicit CD date.

ALTER TABLE case_diaries
  ADD COLUMN IF NOT EXISTS case_diary_date timestamp with time zone;
