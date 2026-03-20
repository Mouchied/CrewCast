-- ============================================================
-- CrewCast Migration 014: Task-Only Progress Tracking
-- ============================================================
-- Removes job-level total_units and starting_units_completed.
-- Progress, velocity, and ETA are now computed entirely from
-- tasks that have total_units set. Jobs with no tasks that
-- have units will show pace_status = 'no_target'.
-- ============================================================

-- Drop job-level fields replaced by task-level tracking
ALTER TABLE jobs DROP COLUMN IF EXISTS total_units;
ALTER TABLE jobs DROP COLUMN IF EXISTS starting_units_completed;

-- ── Replace snapshot trigger with task-only logic ─────────
CREATE OR REPLACE FUNCTION update_job_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_job                  RECORD;
  v_log_hours            NUMERIC;
  v_total_hours          NUMERIC;
  v_total_days           INTEGER;
  v_total_task_units     NUMERIC;
  v_task_starting        NUMERIC;
  v_completed_task_units NUMERIC;
  v_last7_task_units     NUMERIC;
  v_last7_days           INTEGER;
  v_total_completed      NUMERIC;
  v_remaining            NUMERIC;
  v_avg_units            NUMERIC;
  v_last7_avg            NUMERIC;
  v_ev_pct               NUMERIC;
  v_pv_pct               NUMERIC;
  v_earned_hours         NUMERIC;
  v_burn_rate            NUMERIC;
  v_hours_var            NUMERIC;
  v_forecast_final_hrs   NUMERIC;
  v_timeline_days        INTEGER;
  v_elapsed_days         INTEGER;
  v_est_finish           DATE;
  v_days_diff            INTEGER;
  v_pace_status          TEXT;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;

  -- ── Hours + day count ─────────────────────────────────────
  SELECT
    COALESCE(SUM(COALESCE(hours_worked, 0)), 0),
    COUNT(DISTINCT log_date)
  INTO v_log_hours, v_total_days
  FROM daily_logs
  WHERE job_id = NEW.job_id;

  v_total_hours := v_log_hours + COALESCE(v_job.starting_hours_used, 0);

  -- ── Task-based unit progress ──────────────────────────────
  -- Total scope: sum of total_units across tasks that have it set
  SELECT COALESCE(SUM(total_units), 0)
  INTO v_total_task_units
  FROM tasks
  WHERE job_id = NEW.job_id AND total_units IS NOT NULL AND total_units > 0;

  -- Starting offsets from tasks (units done before tracking started)
  SELECT COALESCE(SUM(COALESCE(starting_units_completed, 0)), 0)
  INTO v_task_starting
  FROM tasks
  WHERE job_id = NEW.job_id AND total_units IS NOT NULL AND total_units > 0;

  -- Units logged against tasks that have total_units
  SELECT COALESCE(SUM(dl.units_completed), 0)
  INTO v_completed_task_units
  FROM daily_logs dl
  JOIN tasks t ON t.id = dl.task_id
  WHERE dl.job_id = NEW.job_id
    AND t.total_units IS NOT NULL AND t.total_units > 0;

  v_total_completed := v_completed_task_units + v_task_starting;
  v_remaining       := GREATEST(v_total_task_units - v_total_completed, 0);

  -- All-time velocity (task units / day, excluding starting offset)
  v_avg_units := CASE WHEN v_total_days > 0
    THEN v_completed_task_units / v_total_days
    ELSE 0
  END;

  -- Last-7-day velocity
  SELECT
    COALESCE(SUM(dl.units_completed), 0),
    COUNT(DISTINCT dl.log_date)
  INTO v_last7_task_units, v_last7_days
  FROM daily_logs dl
  JOIN tasks t ON t.id = dl.task_id
  WHERE dl.job_id = NEW.job_id
    AND t.total_units IS NOT NULL AND t.total_units > 0
    AND dl.log_date >= CURRENT_DATE - INTERVAL '7 days';

  v_last7_avg := CASE
    WHEN v_last7_days > 0 THEN v_last7_task_units / v_last7_days
    ELSE v_avg_units
  END;

  -- ── ETA + schedule variance ───────────────────────────────
  v_est_finish := CASE
    WHEN v_total_task_units = 0 THEN NULL
    WHEN v_last7_avg > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_last7_avg)::INTEGER
    WHEN v_avg_units  > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_avg_units)::INTEGER
    ELSE NULL
  END;

  v_days_diff := CASE
    WHEN v_est_finish IS NOT NULL AND v_job.target_end_date IS NOT NULL
    THEN v_job.target_end_date - v_est_finish
    ELSE NULL
  END;

  -- ── Earned Value ─────────────────────────────────────────
  v_ev_pct := CASE
    WHEN v_total_task_units > 0
    THEN ROUND(v_total_completed / v_total_task_units * 100, 1)
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

  -- ── Pace Status ──────────────────────────────────────────
  v_pace_status := CASE
    WHEN v_total_task_units = 0 THEN 'no_target'
    WHEN v_days_diff IS NULL    THEN 'no_target'
    WHEN v_days_diff >= 2       THEN 'on_track'
    WHEN v_days_diff >= -3      THEN 'at_risk'
    ELSE                             'behind'
  END;

  -- ── Upsert snapshot ──────────────────────────────────────
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
