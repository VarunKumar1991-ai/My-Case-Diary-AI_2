-- Migration 0003: Scope the case-diary-number uniqueness per FIR (मुकदमा).
-- Case Diary No. is a subset of the FIR number — every new investigation starts
-- its own CD-001 sequence. The old (owner_id, case_diary_no) unique index wrongly
-- forbade the same officer from reusing CD-001 across different FIRs.
--
-- This MODIFIES the constraint (drops the narrower unique index, adds the wider
-- one). No rows are deleted; the new index is strictly more permissive, so all
-- existing data remains valid under it.

DROP INDEX IF EXISTS "case_diaries_owner_case_diary_no_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_diaries_owner_fir_case_diary_no_unique" ON "case_diaries" USING btree ("owner_id","fir_no","case_diary_no");
