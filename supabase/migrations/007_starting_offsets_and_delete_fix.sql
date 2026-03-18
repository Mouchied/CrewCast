-- ============================================================
-- CrewCast Migration 007: Starting Offsets + Delete Fix
-- ============================================================
-- Scope:
--   1. Fix job delete: job_snapshots DELETE policy blocked cascades
--      from client-initiated job deletes (RLS USING(FALSE) fires
--      even for FK-cascade operations in the client's context).
--   2. Add starting_units_completed + starting_hours_used to jobs
--      so foremen joining mid-job can record prior progress.
--   3. Update update_job_snapshot() trigger to include the
--      starting offsets in totals/remaining/earned-value calcs.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: FIX JOB_SNAPSHOTS DELETE POLICY
-- ─────────────────────────────────────────────────────────────
-- The "Block direct snapshot delete" policy used USING(FALSE),
-- which PostgreSQL evaluates for ALL deletes including those
-- triggered by ON DELETE CASCADE from the jobs table. When a
-- client with a valid JWT tries to delete a job, the cascade to
-- job_snapshots was silently blocked, causing the entire job
-- delete to fail.
--
-- Fix: allow delete when the snapshot's job belongs to the
-- authenticated user's company (same guard as jobs DELETE).
-- Direct snapshot deletes are still meaningless to clients since
-- the trigger re-creates the row on the next log write, so this
-- change doesn't open a security hole.

DROP POLICY IF EXISTS "Block direct snapshot delete" ON job_snapshots;

CREATE POLICY "Company members delete snapshots"
  ON job_snapshots FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: ADD STARTING OFFSET COLUMNS TO JOBS
-- ─────────────────────────────────────────────────────────────
-- starting_units_completed: units already done before tracking began
-- starting_hours_used:      man-hours already burned before tracking

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS starting_units_completed NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starting_hours_used      NUMERIC DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: UPDATE SNAPSHOT TRIGGER TO INCLUDE OFFSETS
-- ─────────────────────────────────────────────────────────────
-- v_total_completed and v_total_hours now include the starting
-- offsets so progress bars, ETA, and burn rate all reflect the
-- true state of the job from day one.
--
-- avg_units_per_day is intentionally kept as logs-only (we don't
-- divide starting units by a day count we don't have), so the
-- velocity metric stays accurate.

CREATE OR REPLACE FUNCTION update_job_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_job                 RECORD;
  v_log_completed       NUMERIC;
  v_log_hours           NUMERIC;
  v_total_completed     NUMERIC;
  v_total_hours         NUMERIC;
  v_total_days          INTEGER;
  v_avg_units           NUMERIC;
  v_last7_avg           NUMERIC;
  v_remaining           NUMERIC;
  v_est_finish          DATE;
  v_days_diff           INTEGER;
  v_ev_pct              NUMERIC;
  v_pv_pct              NUMERIC;
  v_earned_hours        NUMERIC;
  v_burn_rate           NUMERIC;
  v_hours_var           NUMERIC;
  v_forecast_final_hrs  NUMERIC;
  v_timeline_days       INTEGER;
  v_elapsed_days        INTEGER;
  v_pace_status         TEXT;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;

  -- Aggregate logs (velocity metrics use logs-only data)
  SELECT
    COALESCE(SUM(units_completed), 0),
    COALESCE(SUM(COALESCE(hours_worked, 0)), 0),
    COUNT(*)
  INTO v_log_completed, v_log_hours, v_total_days
  FROM daily_logs
  WHERE job_id = NEW.job_id;

  -- Add starting offsets to totals (for progress, EV, burn rate)
  v_total_completed := v_log_completed + COALESCE(v_job.starting_units_completed, 0);
  v_total_hours     := v_log_hours     + COALESCE(v_job.starting_hours_used, 0);

  -- Velocity: based on logged days only (no phantom day for starting units)
  v_avg_units := CASE WHEN v_total_days > 0 THEN v_log_completed / v_total_days ELSE 0 END;

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

  -- Earned Value Analysis
  v_ev_pct := CASE
    WHEN v_job.total_units > 0 THEN ROUND(v_total_completed / v_job.total_units * 100, 1)
    ELSE 0
  END;

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

  v_earned_hours := CASE
    WHEN v_job.bid_hours IS NOT NULL AND v_job.bid_hours > 0
    THEN ROUND(v_ev_pct / 100 * v_job.bid_hours, 1)
    ELSE NULL
  END;

  v_burn_rate := CASE
    WHEN v_earned_hours IS NOT NULL AND v_earned_hours > 0
    THEN ROUND(v_total_hours / v_earned_hours, 3)
    ELSE NULL
  END;

  v_hours_var := CASE
    WHEN v_earned_hours IS NOT NULL
    THEN ROUND(v_earned_hours - v_total_hours, 1)
    ELSE NULL
  END;

  v_forecast_final_hrs := CASE
    WHEN v_burn_rate IS NOT NULL AND v_job.bid_hours IS NOT NULL
    THEN ROUND(v_burn_rate * v_job.bid_hours, 0)
    ELSE NULL
  END;

  -- Pace Status
  v_pace_status := CASE
    WHEN v_days_diff IS NULL          THEN 'no_target'
    WHEN v_days_diff >= 2             THEN 'on_track'
    WHEN v_days_diff >= -3            THEN 'at_risk'
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
