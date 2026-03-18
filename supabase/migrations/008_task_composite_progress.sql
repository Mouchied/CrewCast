-- ============================================================
-- CrewCast Migration 008: Task-Based Composite Job Progress
-- ============================================================
-- Scope:
--   Update update_job_snapshot() so that when a job has tasks
--   with total_units set, job progress is computed as:
--
--     completed_task_units / total_task_units × job.total_units
--
--   Example: 5 tasks × 316 rows each = 1580 total task-units.
--   If 474 task-units are logged (30% avg across tasks), the
--   snapshot reports 0.30 × 316 = 94.8 "effective rows" complete.
--
--   Velocity (avg_units_per_day) is expressed in effective rows
--   so ETA stays meaningful in the job's native unit (rows).
--
--   When NO tasks have total_units (legacy mode), behaviour is
--   identical to migration 007 — sum of daily_logs.units_completed.
-- ============================================================

CREATE OR REPLACE FUNCTION update_job_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_job                  RECORD;
  v_log_completed        NUMERIC;
  v_log_hours            NUMERIC;
  v_total_completed      NUMERIC;
  v_total_hours          NUMERIC;
  v_total_days           INTEGER;
  v_avg_units            NUMERIC;
  v_last7_avg            NUMERIC;
  v_remaining            NUMERIC;
  v_est_finish           DATE;
  v_days_diff            INTEGER;
  v_ev_pct               NUMERIC;
  v_pv_pct               NUMERIC;
  v_earned_hours         NUMERIC;
  v_burn_rate            NUMERIC;
  v_hours_var            NUMERIC;
  v_forecast_final_hrs   NUMERIC;
  v_timeline_days        INTEGER;
  v_elapsed_days         INTEGER;
  v_pace_status          TEXT;
  -- Task-composite variables (declared here to avoid nested DECLARE)
  v_task_mode            BOOLEAN;
  v_total_task_units     NUMERIC;
  v_completed_task_units NUMERIC;
  v_last7_task_units     NUMERIC;
  v_last7_days           INTEGER;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;

  -- ── Determine tracking mode ──────────────────────────────
  -- Task mode = at least one task on this job has total_units > 0
  SELECT
    EXISTS(
      SELECT 1 FROM tasks
      WHERE job_id = NEW.job_id AND total_units IS NOT NULL AND total_units > 0
    ),
    COALESCE(SUM(total_units), 0)
  INTO v_task_mode, v_total_task_units
  FROM tasks
  WHERE job_id = NEW.job_id AND total_units IS NOT NULL AND total_units > 0;

  -- ── Hours + day count (same in both modes) ────────────────
  SELECT
    COALESCE(SUM(COALESCE(hours_worked, 0)), 0),
    COUNT(DISTINCT log_date)
  INTO v_log_hours, v_total_days
  FROM daily_logs
  WHERE job_id = NEW.job_id;

  v_total_hours := v_log_hours + COALESCE(v_job.starting_hours_used, 0);

  -- ── Unit progress ─────────────────────────────────────────
  IF v_task_mode AND v_total_task_units > 0 THEN

    -- Sum units logged against tasks that have total_units set
    SELECT COALESCE(SUM(dl.units_completed), 0)
    INTO v_completed_task_units
    FROM daily_logs dl
    JOIN tasks t ON t.id = dl.task_id
    WHERE dl.job_id = NEW.job_id
      AND t.total_units IS NOT NULL
      AND t.total_units > 0;

    -- Express as effective job-unit progress (e.g. rows)
    v_log_completed   := (v_completed_task_units / v_total_task_units) * v_job.total_units;
    v_total_completed := v_log_completed + COALESCE(v_job.starting_units_completed, 0);

    -- Velocity in effective job-units per day
    v_avg_units := CASE WHEN v_total_days > 0
      THEN v_log_completed / v_total_days
      ELSE 0
    END;

    -- Last-7-day rolling velocity
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
      WHEN v_last7_days > 0
        THEN (v_last7_task_units / v_total_task_units) * v_job.total_units / v_last7_days
      ELSE v_avg_units
    END;

  ELSE
    -- ── Legacy mode: sum all daily_logs.units_completed ──────
    SELECT COALESCE(SUM(units_completed), 0)
    INTO v_log_completed
    FROM daily_logs
    WHERE job_id = NEW.job_id;

    v_total_completed := v_log_completed + COALESCE(v_job.starting_units_completed, 0);

    v_avg_units := CASE WHEN v_total_days > 0
      THEN v_log_completed / v_total_days
      ELSE 0
    END;

    SELECT COALESCE(AVG(units_completed), v_avg_units)
    INTO v_last7_avg
    FROM daily_logs
    WHERE job_id = NEW.job_id
      AND log_date >= CURRENT_DATE - INTERVAL '7 days';

  END IF;

  -- ── ETA + schedule variance ───────────────────────────────
  v_remaining := GREATEST(v_job.total_units - v_total_completed, 0);

  v_est_finish := CASE
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
    WHEN v_job.total_units > 0
    THEN ROUND(v_total_completed / v_job.total_units * 100, 1)
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
    WHEN v_days_diff IS NULL THEN 'no_target'
    WHEN v_days_diff >= 2   THEN 'on_track'
    WHEN v_days_diff >= -3  THEN 'at_risk'
    ELSE                         'behind'
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
