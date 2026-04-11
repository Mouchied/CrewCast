-- ============================================================
-- CrewCast Migration 014: Fix task_variables RLS policies
-- ============================================================
-- Migration 013 introduced task_variables but used the broken
-- auth_company_id() pattern in all four RLS policies. This
-- function can return NULL under edge conditions; `column = NULL`
-- is never true in SQL, so the policy silently blocks all
-- operations (0 rows affected, no error).
--
-- Fix: replace every auth_company_id() call with the safe
-- nested-SELECT pattern established in Migrations 009-010:
--   WHERE j.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
--
-- This mirrors the fix applied to job_variables, log_crew_assignments,
-- and log_variable_overrides in Migration 010.
-- ============================================================

-- ── SELECT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members read task variables" ON task_variables;

CREATE POLICY "Company members read task variables"
  ON task_variables FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── INSERT ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members insert task variables" ON task_variables;

CREATE POLICY "Company members insert task variables"
  ON task_variables FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── UPDATE ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members update task variables" ON task_variables;

CREATE POLICY "Company members update task variables"
  ON task_variables FOR UPDATE
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── DELETE ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members delete task variables" ON task_variables;

CREATE POLICY "Company members delete task variables"
  ON task_variables FOR DELETE
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
