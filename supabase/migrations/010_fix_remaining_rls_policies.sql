-- ============================================================
-- CrewCast Migration 010: Fix remaining auth_company_id() RLS policies
-- ============================================================
-- Migration 009 fixed: jobs, job_snapshots, daily_logs
-- This fixes the remaining cascade-blocking policies:
--   job_variables         (cascades from jobs ON DELETE CASCADE)
--   log_crew_assignments  (cascades from daily_logs ON DELETE CASCADE)
--   log_variable_overrides (cascades from daily_logs ON DELETE CASCADE)
-- All three block job-delete transactions when auth_company_id() = NULL.
-- ============================================================

-- ── job_variables DELETE ──────────────────────────────────────
DROP POLICY IF EXISTS "Company members delete job variables" ON job_variables;

CREATE POLICY "Company members delete job variables"
  ON job_variables FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── log_crew_assignments DELETE ───────────────────────────────
DROP POLICY IF EXISTS "Company members delete crew assignments" ON log_crew_assignments;

CREATE POLICY "Company members delete crew assignments"
  ON log_crew_assignments FOR DELETE
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── log_variable_overrides DELETE ────────────────────────────
DROP POLICY IF EXISTS "Company members delete log variable overrides" ON log_variable_overrides;

CREATE POLICY "Company members delete log variable overrides"
  ON log_variable_overrides FOR DELETE
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
