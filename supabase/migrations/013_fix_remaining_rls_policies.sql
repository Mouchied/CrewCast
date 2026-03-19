-- ============================================================
-- CrewCast Migration 013: Fix all remaining auth_company_id() RLS policies
-- ============================================================
-- Migrations 009, 010, 012 fixed specific tables. This migration
-- completes the sweep by fixing every remaining policy that still
-- uses auth_company_id() in USING or WITH CHECK clauses.
--
-- Affected tables (not yet fixed):
--   crew_members         — SELECT, INSERT, UPDATE, DELETE (migration 004)
--   job_variables        — SELECT, INSERT, UPDATE         (migration 005)
--   job_variable_types   — INSERT, UPDATE, DELETE for private types (migration 005)
--
-- Why this matters now:
--   • crew_members SELECT broken   → crew list empty on log form
--   • crew_members INSERT broken   → can't add crew in Settings
--   • job_variables SELECT broken  → job condition defaults don't load
--   • job_variables INSERT broken  → job conditions don't save on new job
-- ============================================================

-- ── 1. crew_members ───────────────────────────────────────────

DROP POLICY IF EXISTS "Company members read crew"   ON crew_members;
DROP POLICY IF EXISTS "Company members insert crew" ON crew_members;
DROP POLICY IF EXISTS "Company members update crew" ON crew_members;
DROP POLICY IF EXISTS "Company members delete crew" ON crew_members;

CREATE POLICY "Company members read crew"
  ON crew_members FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members insert crew"
  ON crew_members FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members update crew"
  ON crew_members FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members delete crew"
  ON crew_members FOR DELETE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── 2. job_variables ──────────────────────────────────────────

DROP POLICY IF EXISTS "Company members read job variables"   ON job_variables;
DROP POLICY IF EXISTS "Company members create job variables" ON job_variables;
DROP POLICY IF EXISTS "Company members update job variables" ON job_variables;
DROP POLICY IF EXISTS "Company members delete job variables" ON job_variables;

CREATE POLICY "Company members read job variables"
  ON job_variables FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members create job variables"
  ON job_variables FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members update job variables"
  ON job_variables FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members delete job variables"
  ON job_variables FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 3. job_variable_types (private/company-owned types) ────────

DROP POLICY IF EXISTS "Company members create variable types"      ON job_variable_types;
DROP POLICY IF EXISTS "Company members update own variable types"  ON job_variable_types;
DROP POLICY IF EXISTS "Company members delete own variable types"  ON job_variable_types;

CREATE POLICY "Company members create variable types"
  ON job_variable_types FOR INSERT
  WITH CHECK (
    is_global = FALSE
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Company members update own variable types"
  ON job_variable_types FOR UPDATE
  USING (
    is_global = FALSE
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    is_global = FALSE
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members delete own variable types"
  ON job_variable_types FOR DELETE
  USING (
    is_global = FALSE
    AND company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
