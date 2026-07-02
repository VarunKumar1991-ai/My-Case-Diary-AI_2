-- Migration 0001: Change case_diaries.visibility default from PRIVATE to PUBLIC.
-- Existing rows are NOT touched — only new inserts without an explicit visibility
-- value will now default to PUBLIC. Owners of existing PRIVATE diaries can use
-- the visibility-change OTP flow to make their FIR public.

ALTER TABLE case_diaries
  ALTER COLUMN visibility SET DEFAULT 'PUBLIC';
