-- ============================================================
-- CrewCast Migration 012: Fix INSERT RLS policies + multi-task logging
-- ============================================================
-- Part 1: Fix three INSERT policies still using auth_company_id()
--   auth_company_id() returns NULL on any hiccup → WITH CHECK
--   evaluates to false silently → 0 rows inserted, no error →
--   app calls router.back() thinking the save succeeded.
--
--   Root cause same as 009/010 but those only fixed UPDATE/DELETE.
--   This fixes INSERT for:
--     • daily_logs
--     • log_crew_assignments
--     • log_variable_overrides
--
-- Part 2: Allow multiple task entries per day
--   Old:  UNIQUE(job_id, log_date)  — one log per job per day
--   New:  Partial unique indexes:
--     • (job_id, log_date) WHERE task_id IS NULL   — one general log per day
--     • (job_id, log_date, task_id) WHERE task_id IS NOT NULL — one per task per day
--   This lets forepeople log racking + wiring + combiner work
--   separately in a single daily session.
-- ============================================================

-- ── 1. Fix daily_logs INSERT policy ──────────────────────────
DROP POLICY IF EXISTS "Company members insert logs" ON daily_logs;

CREATE POLICY "Company members insert logs"
  ON daily_logs FOR INSERT
  WITH CHECK (
    logged_by = auth.uid()
    AND job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 2. Fix log_crew_assignments INSERT policy ─────────────────
DROP POLICY IF EXISTS "Company members create crew assignments" ON log_crew_assignments;

CREATE POLICY "Company members create crew assignments"
  ON log_crew_assignments FOR INSERT
  WITH CHECK (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 3. Fix log_variable_overrides INSERT policy ───────────────
DROP POLICY IF EXISTS "Company members create log overrides" ON log_variable_overrides;

CREATE POLICY "Company members create log overrides"
  ON log_variable_overrides FOR INSERT
  WITH CHECK (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 4. Update unique constraint for multi-task logging ─────────
-- Drop the old single-log-per-day constraint.
ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_job_id_log_date_key;

-- One "general" (no task selected) log per job per day.
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_job_date_general_unique
  ON daily_logs (job_id, log_date)
  WHERE task_id IS NULL;

-- One log per task per day (allows multiple task logs on same date).
CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_job_date_task_unique
  ON daily_logs (job_id, log_date, task_id)
  WHERE task_id IS NOT NULL;
