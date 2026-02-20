-- ============================================================
-- CrewCast Migration 004: Security Hardening
-- ============================================================
-- Scope:
--   1. Security-definer helper functions (break self-referential
--      policy recursion and support team visibility)
--   2. Replace handle_new_user() — atomic company + profile
--      creation; invited users join existing company
--   3. Tighten companies INSERT
--   4. Profiles: NOT NULL company_id, FK change, team visibility,
--      role-escalation prevention, UPDATE WITH CHECK
--   5. daily_logs: fix INSERT, add UPDATE + DELETE
--   6. task_types: enforce created_by, add UPDATE + DELETE
--   7. jobs: add DELETE
--   8. job_snapshots: explicit write lock (client cannot mutate)
--   9. crew_members: replace ALL policy with explicit per-op
--  10. company_subscriptions: explicit write lock
--  11. company_invitations: add UPDATE + DELETE
--  12. usage_snapshots: explicit write lock
--  13. plans: explicit write lock
--  14. Defensive indexes
-- ============================================================
-- WHAT IS NOT CHANGED:
--   • update_job_snapshot() forecasting trigger — untouched
--   • provision_starter_plan() trigger — untouched
--   • check_seat_limit() trigger — untouched
--   • All schema column definitions — untouched
--   • Seed data in task_types — untouched
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: SECURITY-DEFINER HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────
-- These run as the function owner (bypassing RLS) when called
-- from inside an RLS policy expression, preventing the infinite
-- recursion that occurs when a profiles policy queries profiles.

CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: REPLACE handle_new_user() TRIGGER
-- ─────────────────────────────────────────────────────────────
-- Old behavior: creates profile with company_id = NULL (broken).
-- New behavior:
--   • If raw_user_meta_data contains 'invite_token': validates the
--     invitation, joins the existing company as 'foreman', marks
--     the invitation accepted.
--   • Otherwise: creates a new company from 'company_name' /
--     'industry' metadata, assigns profile as 'admin' (first user
--     of a new company is always the admin).
-- The company name defaults to 'My Company' if not provided so
-- the constraint company.name NOT NULL is never violated.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id    UUID;
  v_full_name     TEXT;
  v_company_name  TEXT;
  v_industry      TEXT;
  v_invite_token  TEXT;
  v_invite        RECORD;
BEGIN
  v_full_name    := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
  v_company_name := COALESCE(NEW.raw_user_meta_data->>'company_name', 'My Company');
  v_industry     := NEW.raw_user_meta_data->>'industry';
  v_invite_token := NEW.raw_user_meta_data->>'invite_token';

  -- ── Invited user: join an existing company ──────────────────
  IF v_invite_token IS NOT NULL AND v_invite_token != '' THEN
    SELECT *
    INTO v_invite
    FROM company_invitations
    WHERE token     = v_invite_token
      AND accepted  = FALSE
      AND expires_at > NOW()
    LIMIT 1;

    IF FOUND THEN
      v_company_id := v_invite.company_id;

      -- Mark invitation consumed
      UPDATE company_invitations
        SET accepted = TRUE
        WHERE id = v_invite.id;

      INSERT INTO profiles (id, company_id, full_name, role)
      VALUES (NEW.id, v_company_id, v_full_name, v_invite.role);

      RETURN NEW;
    END IF;
    -- If invite token is invalid / expired, fall through and
    -- create a new company rather than silently failing.
  END IF;

  -- ── New company signup: create company atomically ───────────
  INSERT INTO companies (name, industry)
  VALUES (v_company_name, v_industry)
  RETURNING id INTO v_company_id;

  -- First user of a new company is always the admin
  INSERT INTO profiles (id, company_id, full_name, role)
  VALUES (NEW.id, v_company_id, v_full_name, 'admin');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from migration 001 — just replace the function.
-- No need to recreate the trigger.

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: PROFILES TABLE HARDENING
-- ─────────────────────────────────────────────────────────────

-- 3a. Enforce NOT NULL on company_id now that the trigger always
--     sets it. Clean up any rows left broken by the old trigger.
DELETE FROM profiles WHERE company_id IS NULL;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_company_id_fkey;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_company_id_fkey
    FOREIGN KEY (company_id)
    REFERENCES companies(id)
    ON DELETE RESTRICT;  -- prevent deleting a company that has users

ALTER TABLE profiles
  ALTER COLUMN company_id SET NOT NULL;

-- 3b. Drop all existing profiles policies and replace with
--     hardened versions.
DROP POLICY IF EXISTS "Users read own profile"        ON profiles;
DROP POLICY IF EXISTS "Users update own profile"      ON profiles;
DROP POLICY IF EXISTS "Users insert own profile"      ON profiles;

-- SELECT: own row OR any row in the same company (for team roster
-- in Settings screen). Uses security-definer helper to avoid
-- self-referential recursion.
CREATE POLICY "Users read own and company profiles"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR company_id = auth_company_id()
  );

-- INSERT: trigger handles this — disallow all direct client inserts.
-- Only the handle_new_user() SECURITY DEFINER trigger may insert.
CREATE POLICY "Block direct profile insert"
  ON profiles FOR INSERT
  WITH CHECK (FALSE);

-- UPDATE: own row only; cannot change company (lock-in to tenant)
-- and cannot self-escalate role.
CREATE POLICY "Users update own profile restricted"
  ON profiles FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id         = auth.uid()
    AND company_id = auth_company_id()   -- cannot switch companies
    AND role       = auth_user_role()    -- cannot self-escalate role
  );

-- DELETE: no client can delete profiles (service-role only).
-- (No policy = default DENY with RLS enabled.)

-- ─────────────────────────────────────────────────────────────
-- SECTION 4: COMPANIES TABLE HARDENING
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can create companies" ON companies;

-- INSERT: only via the handle_new_user() SECURITY DEFINER trigger.
-- Direct client inserts are blocked.
CREATE POLICY "Block direct company insert"
  ON companies FOR INSERT
  WITH CHECK (FALSE);

-- UPDATE: only admins of that company may update their own company.
CREATE POLICY "Company admins update company"
  ON companies FOR UPDATE
  USING  (id = auth_company_id() AND auth_user_role() = 'admin')
  WITH CHECK (id = auth_company_id() AND auth_user_role() = 'admin');

-- DELETE: blocked for all clients (service-role only).
-- (No policy = default DENY.)

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: DAILY_LOGS TABLE HARDENING
-- ─────────────────────────────────────────────────────────────

-- Drop the permissive INSERT policy.
DROP POLICY IF EXISTS "Authenticated users create logs" ON daily_logs;

-- INSERT: logger must be the current user AND the job must belong
-- to the user's company. Prevents cross-company log injection.
CREATE POLICY "Company members insert logs"
  ON daily_logs FOR INSERT
  WITH CHECK (
    logged_by = auth.uid()
    AND job_id IN (
      SELECT id FROM jobs
      WHERE company_id = auth_company_id()
    )
  );

-- UPDATE: only members of the job's company may update logs.
CREATE POLICY "Company members update logs"
  ON daily_logs FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM jobs
      WHERE company_id = auth_company_id()
    )
  )
  WITH CHECK (
    logged_by = auth.uid()
    AND job_id IN (
      SELECT id FROM jobs
      WHERE company_id = auth_company_id()
    )
  );

-- DELETE: only members of the job's company may delete logs.
CREATE POLICY "Company members delete logs"
  ON daily_logs FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs
      WHERE company_id = auth_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: TASK_TYPES TABLE HARDENING
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users create task types" ON task_types;

-- INSERT: created_by must equal auth.uid(). Prevents impersonation.
CREATE POLICY "Users create own task types"
  ON task_types FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- UPDATE: only the creator may update their own non-global task types.
CREATE POLICY "Creators update own task types"
  ON task_types FOR UPDATE
  USING  (created_by = auth.uid() AND is_global = FALSE)
  WITH CHECK (created_by = auth.uid() AND is_global = FALSE);

-- DELETE: only the creator may delete their own non-global task types.
CREATE POLICY "Creators delete own task types"
  ON task_types FOR DELETE
  USING (created_by = auth.uid() AND is_global = FALSE);

-- ─────────────────────────────────────────────────────────────
-- SECTION 7: JOBS TABLE HARDENING
-- ─────────────────────────────────────────────────────────────

-- UPDATE: add WITH CHECK to prevent changing company_id after creation.
DROP POLICY IF EXISTS "Company members update jobs" ON jobs;

CREATE POLICY "Company members update jobs"
  ON jobs FOR UPDATE
  USING  (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());  -- cannot move job between companies

-- DELETE: company members may delete their own company's jobs.
CREATE POLICY "Company members delete jobs"
  ON jobs FOR DELETE
  USING (company_id = auth_company_id());

-- ─────────────────────────────────────────────────────────────
-- SECTION 8: JOB_SNAPSHOTS TABLE — EXPLICIT WRITE LOCK
-- ─────────────────────────────────────────────────────────────
-- The update_job_snapshot() trigger (SECURITY DEFINER) is the
-- only legitimate writer. Lock out all direct client writes.

-- INSERT: blocked (trigger uses SECURITY DEFINER, bypasses RLS).
CREATE POLICY "Block direct snapshot insert"
  ON job_snapshots FOR INSERT
  WITH CHECK (FALSE);

-- UPDATE: blocked.
CREATE POLICY "Block direct snapshot update"
  ON job_snapshots FOR UPDATE
  USING (FALSE);

-- DELETE: blocked.
CREATE POLICY "Block direct snapshot delete"
  ON job_snapshots FOR DELETE
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────
-- SECTION 9: CREW_MEMBERS — REPLACE FOR ALL WITH EXPLICIT POLICIES
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Company members manage crew" ON crew_members;

CREATE POLICY "Company members read crew"
  ON crew_members FOR SELECT
  USING (company_id = auth_company_id());

CREATE POLICY "Company members insert crew"
  ON crew_members FOR INSERT
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY "Company members update crew"
  ON crew_members FOR UPDATE
  USING  (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

CREATE POLICY "Company members delete crew"
  ON crew_members FOR DELETE
  USING (company_id = auth_company_id());

-- ─────────────────────────────────────────────────────────────
-- SECTION 10: COMPANY_SUBSCRIPTIONS — EXPLICIT WRITE LOCK
-- ─────────────────────────────────────────────────────────────
-- Only the provision_starter_plan() trigger and Stripe webhook
-- (service role key) may write to this table. All client writes
-- are blocked.

CREATE POLICY "Block client subscription insert"
  ON company_subscriptions FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "Block client subscription update"
  ON company_subscriptions FOR UPDATE
  USING (FALSE);

CREATE POLICY "Block client subscription delete"
  ON company_subscriptions FOR DELETE
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────
-- SECTION 11: COMPANY_INVITATIONS — ADD UPDATE + DELETE
-- ─────────────────────────────────────────────────────────────

-- UPDATE: only company admins may update invitations (e.g. revoke).
CREATE POLICY "Company admins update invitations"
  ON company_invitations FOR UPDATE
  USING  (
    company_id = auth_company_id()
    AND auth_user_role() = 'admin'
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND auth_user_role() = 'admin'
  );

-- DELETE: only company admins may revoke invitations.
CREATE POLICY "Company admins delete invitations"
  ON company_invitations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND auth_user_role() = 'admin'
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 12: USAGE_SNAPSHOTS — EXPLICIT WRITE LOCK
-- ─────────────────────────────────────────────────────────────
-- Written only by backend/service role. Block all client writes.

CREATE POLICY "Block client usage insert"
  ON usage_snapshots FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "Block client usage update"
  ON usage_snapshots FOR UPDATE
  USING (FALSE);

CREATE POLICY "Block client usage delete"
  ON usage_snapshots FOR DELETE
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────
-- SECTION 13: PLANS — EXPLICIT WRITE LOCK
-- ─────────────────────────────────────────────────────────────
-- Seed data only. No client may modify plan records.

CREATE POLICY "Block client plan insert"
  ON plans FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "Block client plan update"
  ON plans FOR UPDATE
  USING (FALSE);

CREATE POLICY "Block client plan delete"
  ON plans FOR DELETE
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────
-- SECTION 14: DEFENSIVE INDEXES
-- ─────────────────────────────────────────────────────────────
-- These eliminate sequential scans in every RLS policy expression
-- that looks up company_id by user identity. Without these, each
-- row-level check does a full table scan on profiles.

CREATE INDEX IF NOT EXISTS idx_profiles_company_id
  ON profiles(company_id);

CREATE INDEX IF NOT EXISTS idx_profiles_id_company_id
  ON profiles(id, company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id
  ON jobs(company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_status_company_id
  ON jobs(company_id, status);

CREATE INDEX IF NOT EXISTS idx_daily_logs_job_id
  ON daily_logs(job_id);

CREATE INDEX IF NOT EXISTS idx_daily_logs_log_date
  ON daily_logs(log_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_logs_job_date
  ON daily_logs(job_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_job_id
  ON tasks(job_id);

CREATE INDEX IF NOT EXISTS idx_crew_members_company_id
  ON crew_members(company_id);

CREATE INDEX IF NOT EXISTS idx_company_invitations_token
  ON company_invitations(token);

CREATE INDEX IF NOT EXISTS idx_company_invitations_email
  ON company_invitations(email);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_id
  ON company_subscriptions(company_id);

CREATE INDEX IF NOT EXISTS idx_job_snapshots_job_id
  ON job_snapshots(job_id);

-- ─────────────────────────────────────────────────────────────
-- SECTION 15: TASKS — ADD WITH CHECK TO UPDATE POLICY
-- ─────────────────────────────────────────────────────────────
-- The tasks UPDATE policy from migration 003 is correct for
-- USING, but is missing WITH CHECK. Ensure the row being written
-- still belongs to the company after update.

DROP POLICY IF EXISTS "Company members update tasks" ON tasks;

CREATE POLICY "Company members update tasks"
  ON tasks FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- AUDIT SUMMARY (for reference)
-- ─────────────────────────────────────────────────────────────
-- After this migration, every table's policy matrix is:
--
-- TABLE                 | SEL | INS | UPD | DEL
-- ----------------------|-----|-----|-----|----
-- companies             |  ✓  | LOCK|  ✓* |LOCK
-- profiles              |  ✓* | LOCK|  ✓* |LOCK
-- task_types            |  ✓  |  ✓* |  ✓  |  ✓
-- jobs                  |  ✓  |  ✓  |  ✓  |  ✓
-- daily_logs            |  ✓  |  ✓* |  ✓  |  ✓
-- job_snapshots         |  ✓  | LOCK| LOCK|LOCK
-- tasks                 |  ✓  |  ✓  |  ✓* |  ✓
-- crew_members          |  ✓  |  ✓  |  ✓  |  ✓
-- plans                 |  ✓  | LOCK| LOCK|LOCK
-- company_subscriptions |  ✓  | LOCK| LOCK|LOCK
-- company_invitations   |  ✓  |  ✓  |  ✓* |  ✓*
-- usage_snapshots       |  ✓  | LOCK| LOCK|LOCK
--
-- ✓  = policy exists and is scoped to company
-- ✓* = policy exists with additional hardening (WITH CHECK / role)
-- LOCK = WITH CHECK (FALSE) or USING (FALSE) — service role only
