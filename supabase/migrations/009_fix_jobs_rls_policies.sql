-- ============================================================
-- CrewCast Migration 009: Fix jobs RLS policies
-- ============================================================
-- Root cause: the jobs UPDATE and DELETE policies (from 004)
-- rely on auth_company_id() which can return NULL if the profile
-- lookup fails (new session, race condition, etc.).
-- NULL = NULL is false in SQL, so the policy silently blocks
-- every operation without returning an error.
--
-- Fix: replace auth_company_id() calls on jobs with the same
-- safe nested-SELECT pattern already used by the tasks table.
-- This pattern never returns NULL; it just yields zero rows.
-- ============================================================

-- ── Jobs: rebuild UPDATE and DELETE policies ──────────────────
DROP POLICY IF EXISTS "Company members update jobs" ON jobs;
DROP POLICY IF EXISTS "Company members delete jobs" ON jobs;

CREATE POLICY "Company members update jobs"
  ON jobs FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company members delete jobs"
  ON jobs FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── daily_logs: same fix for UPDATE and DELETE ───────────────
-- Migration 004 also used auth_company_id() there.
DROP POLICY IF EXISTS "Company members update logs"  ON daily_logs;
DROP POLICY IF EXISTS "Company members delete logs"  ON daily_logs;

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
