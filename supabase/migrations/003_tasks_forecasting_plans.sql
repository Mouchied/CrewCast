-- CrewCast Migration 003
-- Adds: tasks within jobs, bid labor budget on jobs,
--       percent_complete + task_id on daily_logs,
--       full earned value / burn rate forecasting,
--       corrected subscription plan pricing

-- ─────────────────────────────────────────────
-- 1. TASKS (sub-tasks within a job)
-- These are the units of work that get tracked daily.
-- A job might have: Site Prep → Racking → Panel Install → Wiring → Commissioning
-- ─────────────────────────────────────────────
CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  sequence_order      INTEGER NOT NULL DEFAULT 0,  -- display/work order
  estimated_hours     NUMERIC,                      -- bid hours for this task
  estimated_crew_size INTEGER,                      -- bid crew size for this task
  unit                TEXT,                         -- unit if different from job unit
  total_units         NUMERIC,                      -- total units for this specific task
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | active | completed
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read tasks"
  ON tasks FOR SELECT
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members create tasks"
  ON tasks FOR INSERT
  WITH CHECK (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members update tasks"
  ON tasks FOR UPDATE
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members delete tasks"
  ON tasks FOR DELETE
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ─────────────────────────────────────────────
-- 2. CREW MEMBERS (optional — headcount or named)
-- ─────────────────────────────────────────────
CREATE TABLE crew_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  trade       TEXT,    -- e.g., 'journeyman electrician', 'apprentice', 'laborer'
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage crew"
  ON crew_members FOR ALL
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ─────────────────────────────────────────────
-- 3. ADD BID FIELDS TO JOBS
-- The bid is the foundation of earned value analysis
-- ─────────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS bid_hours     NUMERIC,  -- total man-hours in the bid
  ADD COLUMN IF NOT EXISTS bid_crew_size INTEGER;  -- assumed crew size when the bid was made

-- ─────────────────────────────────────────────
-- 4. ADD TASK LINK + PERCENT COMPLETE TO DAILY LOGS
-- ─────────────────────────────────────────────
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS percent_complete NUMERIC; -- foreman's estimate: 0-100

-- ─────────────────────────────────────────────
-- 5. EXPAND JOB SNAPSHOTS FOR EARNED VALUE
-- ─────────────────────────────────────────────
ALTER TABLE job_snapshots
  ADD COLUMN IF NOT EXISTS total_hours_worked   NUMERIC DEFAULT 0,  -- actual man-hours spent
  ADD COLUMN IF NOT EXISTS bid_hours            NUMERIC,            -- copied from job.bid_hours
  ADD COLUMN IF NOT EXISTS earned_value_pct     NUMERIC,            -- % of job physically complete (units-based)
  ADD COLUMN IF NOT EXISTS planned_value_pct    NUMERIC,            -- % of timeline elapsed vs target
  ADD COLUMN IF NOT EXISTS burn_rate            NUMERIC,            -- actual_hours / earned_hours (1.0 = perfect)
  ADD COLUMN IF NOT EXISTS hours_variance       NUMERIC,            -- earned_hours - actual_hours (positive = under budget)
  ADD COLUMN IF NOT EXISTS forecast_hours_at_completion NUMERIC,   -- if burn rate continues, final cost
  ADD COLUMN IF NOT EXISTS pace_status          TEXT DEFAULT 'pending'; -- on_track | at_risk | behind | no_target

-- ─────────────────────────────────────────────
-- 6. REPLACE FORECASTING TRIGGER
-- Now includes: earned value, burn rate, man-hour variance, pace status
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_job_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_job                 RECORD;
  v_total_completed     NUMERIC;
  v_total_hours         NUMERIC;
  v_total_days          INTEGER;
  v_avg_units           NUMERIC;
  v_last7_avg           NUMERIC;
  v_remaining           NUMERIC;
  v_est_finish          DATE;
  v_days_diff           INTEGER;
  v_ev_pct              NUMERIC;  -- earned value %
  v_pv_pct              NUMERIC;  -- planned value %
  v_earned_hours        NUMERIC;  -- ev_pct × bid_hours
  v_burn_rate           NUMERIC;  -- actual / earned hours
  v_hours_var           NUMERIC;  -- earned - actual
  v_forecast_final_hrs  NUMERIC;  -- projected total hours at completion
  v_timeline_days       INTEGER;  -- target_end_date - start_date
  v_elapsed_days        INTEGER;  -- today - start_date
  v_pace_status         TEXT;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;

  -- Aggregate logs
  SELECT
    COALESCE(SUM(units_completed), 0),
    COALESCE(SUM(COALESCE(hours_worked, 0)), 0),
    COUNT(*)
  INTO v_total_completed, v_total_hours, v_total_days
  FROM daily_logs
  WHERE job_id = NEW.job_id;

  v_avg_units := CASE WHEN v_total_days > 0 THEN v_total_completed / v_total_days ELSE 0 END;

  -- Last 7 days rolling avg
  SELECT COALESCE(AVG(units_completed), v_avg_units) INTO v_last7_avg
  FROM daily_logs
  WHERE job_id = NEW.job_id
    AND log_date >= CURRENT_DATE - INTERVAL '7 days';

  v_remaining := GREATEST(v_job.total_units - v_total_completed, 0);

  -- ETA
  v_est_finish := CASE
    WHEN v_last7_avg > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_last7_avg)::INTEGER
    WHEN v_avg_units > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_avg_units)::INTEGER
    ELSE NULL
  END;

  v_days_diff := CASE
    WHEN v_est_finish IS NOT NULL AND v_job.target_end_date IS NOT NULL
    THEN v_job.target_end_date - v_est_finish
    ELSE NULL
  END;

  -- ── Earned Value Analysis ──
  v_ev_pct := CASE
    WHEN v_job.total_units > 0 THEN ROUND(v_total_completed / v_job.total_units * 100, 1)
    ELSE 0
  END;

  -- Planned value % = elapsed timeline / total timeline
  v_timeline_days := CASE
    WHEN v_job.target_end_date IS NOT NULL AND v_job.start_date IS NOT NULL
    THEN v_job.target_end_date - v_job.start_date
    ELSE NULL
  END;
  v_elapsed_days := CURRENT_DATE - v_job.start_date;
  v_pv_pct := CASE
    WHEN v_timeline_days IS NOT NULL AND v_timeline_days > 0
    THEN ROUND(LEAST(v_elapsed_days::NUMERIC / v_timeline_days * 100, 100), 1)
    ELSE NULL
  END;

  -- Earned hours = ev_pct × bid_hours
  v_earned_hours := CASE
    WHEN v_job.bid_hours IS NOT NULL AND v_job.bid_hours > 0
    THEN ROUND(v_ev_pct / 100 * v_job.bid_hours, 1)
    ELSE NULL
  END;

  -- Burn rate = actual_hours / earned_hours
  v_burn_rate := CASE
    WHEN v_earned_hours IS NOT NULL AND v_earned_hours > 0
    THEN ROUND(v_total_hours / v_earned_hours, 3)
    ELSE NULL
  END;

  -- Hours variance = earned - actual (positive = under budget)
  v_hours_var := CASE
    WHEN v_earned_hours IS NOT NULL
    THEN ROUND(v_earned_hours - v_total_hours, 1)
    ELSE NULL
  END;

  -- Forecast final hours (if burn rate continues to end)
  v_forecast_final_hrs := CASE
    WHEN v_burn_rate IS NOT NULL AND v_job.bid_hours IS NOT NULL
    THEN ROUND(v_burn_rate * v_job.bid_hours, 0)
    ELSE NULL
  END;

  -- ── Pace Status ──
  v_pace_status := CASE
    WHEN v_days_diff IS NULL          THEN 'no_target'
    WHEN v_days_diff >= 2             THEN 'on_track'
    WHEN v_days_diff >= -3            THEN 'at_risk'    -- within 3 days of being behind
    ELSE                                   'behind'
  END;

  INSERT INTO job_snapshots (
    job_id,
    units_completed, units_remaining,
    avg_units_per_day, last_7_day_avg,
    estimated_finish_date, days_ahead_behind,
    total_days_logged,
    total_hours_worked, bid_hours,
    earned_value_pct, planned_value_pct,
    burn_rate, hours_variance,
    forecast_hours_at_completion,
    pace_status,
    updated_at
  ) VALUES (
    NEW.job_id,
    v_total_completed, v_remaining,
    ROUND(v_avg_units, 2), ROUND(v_last7_avg, 2),
    v_est_finish, v_days_diff,
    v_total_days,
    v_total_hours, v_job.bid_hours,
    v_ev_pct, v_pv_pct,
    v_burn_rate, v_hours_var,
    v_forecast_final_hrs,
    v_pace_status,
    NOW()
  )
  ON CONFLICT (job_id) DO UPDATE SET
    units_completed              = EXCLUDED.units_completed,
    units_remaining              = EXCLUDED.units_remaining,
    avg_units_per_day            = EXCLUDED.avg_units_per_day,
    last_7_day_avg               = EXCLUDED.last_7_day_avg,
    estimated_finish_date        = EXCLUDED.estimated_finish_date,
    days_ahead_behind            = EXCLUDED.days_ahead_behind,
    total_days_logged            = EXCLUDED.total_days_logged,
    total_hours_worked           = EXCLUDED.total_hours_worked,
    bid_hours                    = EXCLUDED.bid_hours,
    earned_value_pct             = EXCLUDED.earned_value_pct,
    planned_value_pct            = EXCLUDED.planned_value_pct,
    burn_rate                    = EXCLUDED.burn_rate,
    hours_variance               = EXCLUDED.hours_variance,
    forecast_hours_at_completion = EXCLUDED.forecast_hours_at_completion,
    pace_status                  = EXCLUDED.pace_status,
    updated_at                   = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- 7. CORRECT SUBSCRIPTION PLAN PRICING
-- (matches the product brief exactly)
-- ─────────────────────────────────────────────
DELETE FROM plans;

INSERT INTO plans (id, name, price_monthly, max_users, max_jobs, features) VALUES
  ('starter',
   'Starter',
   100,
   20,
   5,
   '["Real-time ETA tracking", "Weather auto-capture", "GPS location tracking", "Up to 5 active jobs", "Up to 20 users"]'
  ),
  ('growth',
   'Growth',
   250,
   NULL,
   20,
   '["Everything in Starter", "Up to 20 active jobs", "Unlimited users", "Company benchmarks", "Cross-job analytics", "Data export"]'
  ),
  ('enterprise',
   'Enterprise',
   0,
   NULL,
   NULL,
   '["Everything in Growth", "Unlimited jobs", "Priority support", "Custom integrations", "API access", "Bid estimator", "Benchmark insights across all jobs"]'
  );

-- ─────────────────────────────────────────────
-- 8. VIEW: Company benchmark by task type
-- This is the "platform moat" — cross-job productivity benchmarks
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW company_benchmarks AS
SELECT
  j.company_id,
  j.task_type_id,
  tt.name                        AS task_type_name,
  tt.unit,
  COUNT(DISTINCT j.id)           AS job_count,
  ROUND(AVG(js.avg_units_per_day), 2)  AS avg_units_per_day,
  ROUND(MIN(js.avg_units_per_day), 2)  AS min_units_per_day,
  ROUND(MAX(js.avg_units_per_day), 2)  AS max_units_per_day,
  ROUND(AVG(js.burn_rate), 3)          AS avg_burn_rate,
  ROUND(AVG(js.earned_value_pct), 1)   AS avg_completion_pct,
  -- Weather correlation fields (for future ML)
  ROUND(AVG(dl.weather_temp_f), 1)     AS avg_temp_f,
  j.state                              AS state,
  j.climate_zone                       AS climate_zone
FROM jobs j
JOIN job_snapshots js ON js.job_id = j.id
JOIN task_types tt ON tt.id = j.task_type_id
LEFT JOIN daily_logs dl ON dl.job_id = j.id
WHERE j.status IN ('active', 'completed')
  AND js.total_days_logged >= 3        -- only include jobs with meaningful data
GROUP BY j.company_id, j.task_type_id, tt.name, tt.unit, j.state, j.climate_zone;
