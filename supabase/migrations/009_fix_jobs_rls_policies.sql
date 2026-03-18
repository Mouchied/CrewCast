-- ============================================================
-- CrewCast Migration 009: Fix ALL broken auth_company_id() RLS policies
-- ============================================================
-- Root cause: auth_company_id() returns NULL when the profile
-- lookup has any hiccup. In SQL, `column = NULL` is never true,
-- so any policy using auth_company_id() silently blocks the
-- operation (0 rows affected, no error).
--
-- Affected policies introduced in 004 and 007:
--   jobs           UPDATE, DELETE
--   daily_logs     UPDATE, DELETE
--   job_snapshots  DELETE   ← this was blocking cascade-deletes!
--
-- Fix: replace every auth_company_id() call with the safe
-- nested-SELECT pattern already used by the tasks table.
-- The nested SELECT returns an empty set (not NULL) when there
-- is no profile match, so the check evaluates correctly.
--
-- Why job delete and task delete both failed:
--   • Deleting a job cascades to job_snapshots (ON DELETE CASCADE).
--     PostgreSQL/Supabase evaluates the snapshot DELETE policy for
--     that cascaded operation. The broken USING(auth_company_id())
--     policy blocked it → whole transaction rolled back silently.
--   • Deleting a task fires ON DELETE SET NULL on daily_logs.task_id.
--     That fires as an UPDATE on daily_logs, which was also blocked
--     by the broken daily_logs UPDATE policy → task delete rolled back.
-- ============================================================

-- ── 1. jobs UPDATE + DELETE ───────────────────────────────────
DROP POLICY IF EXISTS "Company members update jobs" ON jobs;
DROP POLICY IF EXISTS "Company members delete jobs" ON jobs;

CREATE POLICY "Company members update jobs"
  ON jobs FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members delete jobs"
  ON jobs FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── 2. job_snapshots DELETE (was blocking cascade from job delete) ──
DROP POLICY IF EXISTS "Block direct snapshot delete"    ON job_snapshots;
DROP POLICY IF EXISTS "Company members delete snapshots" ON job_snapshots;

CREATE POLICY "Company members delete snapshots"
  ON job_snapshots FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 3. daily_logs UPDATE + DELETE ────────────────────────────
-- UPDATE is needed for ON DELETE SET NULL cascade from task delete.
DROP POLICY IF EXISTS "Company members update logs" ON daily_logs;
DROP POLICY IF EXISTS "Company members delete logs" ON daily_logs;

CREATE POLICY "Company members update logs"
  ON daily_logs FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members delete logs"
  ON daily_logs FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

