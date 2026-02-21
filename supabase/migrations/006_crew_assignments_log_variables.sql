-- CrewCast Migration 006
-- Crew Member Assignments + Per-Log Variable Tracking
--
-- Enables:
--   1. Tagging which crew members were on each daily log
--      → "Bob, Bill, Dave pulled 4500' DC feeders today with 6 guys"
--      → Per-person productivity = total units / crew_size
--      → Over time: "Bob averages 900 ft/person/day on DC feeders"
--
--   2. Per-log variable overrides show up in the benchmark view
--      correctly — row length 82 panels one day, 98 the next,
--      the engine separates productivity by condition automatically.

-- ─────────────────────────────────────────────
-- 1. LOG CREW ASSIGNMENTS
-- Records which crew members were present on each daily log.
-- hours_worked is optional — for when someone works a partial day.
-- ─────────────────────────────────────────────
CREATE TABLE log_crew_assignments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id   UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  hours_worked   NUMERIC(4,1),  -- optional: partial day, e.g. 4.5
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(daily_log_id, crew_member_id)
);

ALTER TABLE log_crew_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read crew assignments"
  ON log_crew_assignments FOR SELECT
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members create crew assignments"
  ON log_crew_assignments FOR INSERT
  WITH CHECK (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members delete crew assignments"
  ON log_crew_assignments FOR DELETE
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE INDEX idx_log_crew_assignments_log    ON log_crew_assignments(daily_log_id);
CREATE INDEX idx_log_crew_assignments_member ON log_crew_assignments(crew_member_id);

-- ─────────────────────────────────────────────
-- 2. UPDATE variable_productivity_benchmarks VIEW
-- Now operates at the daily-log level (not just per-job),
-- so per-log overrides are respected:
--   Day 1: Row length = 82 panels → productivity tracked separately
--   Day 2: Row length = 98 panels → tracked separately
-- Effective value = log override if present, else job default.
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS variable_productivity_benchmarks;

CREATE VIEW variable_productivity_benchmarks AS
WITH effective_log_vars AS (
  -- Job-default variables, overridden at the log level where applicable
  SELECT
    dl.id               AS daily_log_id,
    dl.job_id,
    dl.units_completed,
    dl.crew_size,
    dl.weather_temp_f,
    j.company_id,
    j.task_type_id,
    j.state,
    jv.variable_type_id,
    COALESCE(lvo.value, jv.value) AS effective_value  -- log override wins
  FROM daily_logs dl
  JOIN jobs j ON j.id = dl.job_id
  JOIN job_variables jv ON jv.job_id = dl.job_id
  LEFT JOIN log_variable_overrides lvo
    ON lvo.daily_log_id = dl.id
    AND lvo.variable_type_id = jv.variable_type_id
  WHERE j.status IN ('active', 'completed')

  UNION ALL

  -- Log-only variable overrides with NO corresponding job-level default
  SELECT
    dl.id               AS daily_log_id,
    dl.job_id,
    dl.units_completed,
    dl.crew_size,
    dl.weather_temp_f,
    j.company_id,
    j.task_type_id,
    j.state,
    lvo.variable_type_id,
    lvo.value           AS effective_value
  FROM daily_logs dl
  JOIN jobs j ON j.id = dl.job_id
  JOIN log_variable_overrides lvo ON lvo.daily_log_id = dl.id
  WHERE j.status IN ('active', 'completed')
    AND NOT EXISTS (
      SELECT 1 FROM job_variables jv2
      WHERE jv2.job_id = dl.job_id
        AND jv2.variable_type_id = lvo.variable_type_id
    )
)
SELECT
  elv.company_id,
  tt.category                             AS trade_category,
  tt.name                                 AS task_type_name,
  tt.unit                                 AS work_unit,
  jvt.name                                AS variable_name,
  elv.effective_value                     AS variable_value,
  jvt.unit_hint                           AS variable_unit,
  COUNT(DISTINCT elv.job_id)              AS job_count,
  COUNT(DISTINCT elv.daily_log_id)        AS total_log_days,
  ROUND(AVG(elv.units_completed), 2)      AS avg_units_per_day,
  ROUND(MIN(elv.units_completed), 2)      AS min_units_per_day,
  ROUND(MAX(elv.units_completed), 2)      AS max_units_per_day,
  ROUND(STDDEV(elv.units_completed), 2)   AS stddev_units_per_day,
  -- Per-person rate (for crew-size-normalized comparison)
  ROUND(
    AVG(elv.units_completed::numeric / NULLIF(elv.crew_size, 0)), 2
  )                                       AS avg_units_per_person_day,
  ROUND(AVG(elv.crew_size), 1)            AS avg_crew_size,
  ROUND(AVG(elv.weather_temp_f), 1)       AS avg_temp_f,
  elv.state
FROM effective_log_vars elv
JOIN task_types        tt  ON tt.id  = elv.task_type_id
JOIN job_variable_types jvt ON jvt.id = elv.variable_type_id
GROUP BY
  elv.company_id,
  tt.category,
  tt.name,
  tt.unit,
  jvt.name,
  elv.effective_value,
  jvt.unit_hint,
  elv.state
ORDER BY
  elv.company_id,
  tt.category,
  jvt.name,
  COUNT(DISTINCT elv.daily_log_id) DESC;

-- ─────────────────────────────────────────────
-- 3. CREW MEMBER BENCHMARKS VIEW
-- "Bob averages 900 ft/person/day on DC feeders in West Texas"
-- "Bill averages 650 ft/person/day on DC feeders"
--
-- Per-person rate = units / crew_size on each log (equal-split assumption).
-- Works for any task type, any trade.
-- ─────────────────────────────────────────────
CREATE VIEW crew_member_benchmarks AS
SELECT
  cm.company_id,
  cm.id                                                    AS crew_member_id,
  cm.name                                                  AS crew_member_name,
  cm.trade,
  tt.category                                              AS trade_category,
  tt.name                                                  AS task_type_name,
  tt.unit                                                  AS work_unit,
  COUNT(DISTINCT dl.id)                                    AS total_log_days,
  COUNT(DISTINCT j.id)                                     AS total_jobs,
  -- Per-person productivity (equal split across crew)
  ROUND(
    AVG(dl.units_completed::numeric / NULLIF(dl.crew_size, 0)), 2
  )                                                        AS avg_units_per_person_day,
  ROUND(
    SUM(dl.units_completed::numeric / NULLIF(dl.crew_size, 0)), 0
  )                                                        AS total_units_attributed,
  ROUND(AVG(lca.hours_worked), 1)                          AS avg_hours_logged,
  ROUND(AVG(dl.weather_temp_f), 1)                         AS avg_temp_f,
  MIN(dl.log_date)                                         AS first_log_date,
  MAX(dl.log_date)                                         AS last_log_date,
  -- Last seen on (most recent log date)
  MAX(dl.log_date)                                         AS last_active
FROM crew_members cm
JOIN log_crew_assignments lca ON lca.crew_member_id = cm.id
JOIN daily_logs dl ON dl.id = lca.daily_log_id
JOIN jobs j ON j.id = dl.job_id
JOIN task_types tt ON tt.id = j.task_type_id
WHERE j.status IN ('active', 'completed')
  AND dl.crew_size > 0
  AND cm.active = TRUE
GROUP BY
  cm.company_id,
  cm.id,
  cm.name,
  cm.trade,
  tt.category,
  tt.name,
  tt.unit
ORDER BY
  cm.company_id,
  cm.name,
  total_log_days DESC;
