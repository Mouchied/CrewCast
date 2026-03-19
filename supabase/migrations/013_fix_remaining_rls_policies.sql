-- ============================================================
-- CrewCast Migration 013: task_variables table + fix all remaining RLS
-- ============================================================
-- Two things in one migration:
--
-- 1. task_variables table (may already exist in production —
--    all DDL is IF NOT EXISTS / idempotent so it is safe to re-run)
--
-- 2. Fix every remaining auth_company_id() usage across:
--    crew_members, job_variables, job_variable_types,
--    log_crew_assignments, log_variable_overrides, task_variables
-- ============================================================

-- ── 1. task_variables ─────────────────────────────────────────
-- Per-task variable overrides (e.g. a task has a different row length
-- than the job default). Mirrors job_variables but scoped to a task.

CREATE TABLE IF NOT EXISTS task_variables (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  variable_type_id UUID NOT NULL REFERENCES job_variable_types(id) ON DELETE CASCADE,
  value            TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, variable_type_id)
);

ALTER TABLE task_variables ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_task_variables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'task_variables_updated_at'
  ) THEN
    CREATE TRIGGER task_variables_updated_at
      BEFORE UPDATE ON task_variables
      FOR EACH ROW EXECUTE FUNCTION update_task_variables_updated_at();
  END IF;
END;
$$;

-- ── 2. crew_members — fix all four policies ───────────────────
DROP POLICY IF EXISTS "Company members read crew"   ON crew_members;
DROP POLICY IF EXISTS "Company members insert crew" ON crew_members;
DROP POLICY IF EXISTS "Company members update crew" ON crew_members;
DROP POLICY IF EXISTS "Company members delete crew" ON crew_members;

CREATE POLICY "Company members read crew"
  ON crew_members FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members insert crew"
  ON crew_members FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members update crew"
  ON crew_members FOR UPDATE
  USING  (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members delete crew"
  ON crew_members FOR DELETE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── 3. job_variables — fix all four policies ─────────────────
DROP POLICY IF EXISTS "Company members read job variables"   ON job_variables;
DROP POLICY IF EXISTS "Company members create job variables" ON job_variables;
DROP POLICY IF EXISTS "Company members update job variables" ON job_variables;
DROP POLICY IF EXISTS "Company members delete job variables" ON job_variables;

CREATE POLICY "Company members read job variables"
  ON job_variables FOR SELECT
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members create job variables"
  ON job_variables FOR INSERT
  WITH CHECK (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members update job variables"
  ON job_variables FOR UPDATE
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ))
  WITH CHECK (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members delete job variables"
  ON job_variables FOR DELETE
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ── 4. job_variable_types — fix private-type policies ─────────
DROP POLICY IF EXISTS "Company members create variable types"     ON job_variable_types;
DROP POLICY IF EXISTS "Company members update own variable types" ON job_variable_types;
DROP POLICY IF EXISTS "Company members delete own variable types" ON job_variable_types;

CREATE POLICY "Company members create variable types"
  ON job_variable_types FOR INSERT
  WITH CHECK (
    is_global = FALSE
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Company members update own variable types"
  ON job_variable_types FOR UPDATE
  USING  (is_global = FALSE AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (is_global = FALSE AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members delete own variable types"
  ON job_variable_types FOR DELETE
  USING (is_global = FALSE AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── 5. log_crew_assignments SELECT ────────────────────────────
DROP POLICY IF EXISTS "Company members read crew assignments" ON log_crew_assignments;

CREATE POLICY "Company members read crew assignments"
  ON log_crew_assignments FOR SELECT
  USING (daily_log_id IN (
    SELECT dl.id FROM daily_logs dl
    JOIN jobs j ON j.id = dl.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

-- ── 6. log_variable_overrides — fix SELECT/UPDATE, deduplicate DELETE ──
DROP POLICY IF EXISTS "Company members read log overrides"           ON log_variable_overrides;
DROP POLICY IF EXISTS "Company members update log overrides"         ON log_variable_overrides;
DROP POLICY IF EXISTS "Company members delete log overrides"         ON log_variable_overrides;
DROP POLICY IF EXISTS "Company members delete log variable overrides" ON log_variable_overrides;

CREATE POLICY "Company members read log overrides"
  ON log_variable_overrides FOR SELECT
  USING (daily_log_id IN (
    SELECT dl.id FROM daily_logs dl
    JOIN jobs j ON j.id = dl.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Company members update log overrides"
  ON log_variable_overrides FOR UPDATE
  USING (daily_log_id IN (
    SELECT dl.id FROM daily_logs dl
    JOIN jobs j ON j.id = dl.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Company members delete log variable overrides"
  ON log_variable_overrides FOR DELETE
  USING (daily_log_id IN (
    SELECT dl.id FROM daily_logs dl
    JOIN jobs j ON j.id = dl.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

-- ── 7. task_variables — safe policies ─────────────────────────
DROP POLICY IF EXISTS "Company members read task variables"   ON task_variables;
DROP POLICY IF EXISTS "Company members insert task variables" ON task_variables;
DROP POLICY IF EXISTS "Company members update task variables" ON task_variables;
DROP POLICY IF EXISTS "Company members delete task variables" ON task_variables;

CREATE POLICY "Company members read task variables"
  ON task_variables FOR SELECT
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Company members insert task variables"
  ON task_variables FOR INSERT
  WITH CHECK (task_id IN (
    SELECT t.id FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Company members update task variables"
  ON task_variables FOR UPDATE
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Company members delete task variables"
  ON task_variables FOR DELETE
  USING (task_id IN (
    SELECT t.id FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ));
