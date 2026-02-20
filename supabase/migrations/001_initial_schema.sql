-- CrewCast Database Schema
-- Every table is designed to capture rich data for long-term analytics

-- Enable PostGIS for geospatial queries (location-based analytics)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- fuzzy text search for task types

-- ─────────────────────────────────────────────
-- COMPANIES
-- ─────────────────────────────────────────────
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  industry      TEXT,                    -- e.g. 'electrical', 'solar', 'hvac'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PROFILES (one per auth user)
-- ─────────────────────────────────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'foreman', -- foreman | crew_lead | admin
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TASK TYPES (standardized catalog)
-- Shared across companies, growing over time — this IS the data asset
-- ─────────────────────────────────────────────
CREATE TABLE task_types (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,    -- e.g. 'Solar panel row installation'
  category      TEXT,                    -- e.g. 'solar', 'wiring', 'racking'
  unit           TEXT NOT NULL DEFAULT 'units', -- e.g. 'rows', 'panels', 'feet', 'fixtures'
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_global     BOOLEAN DEFAULT FALSE,   -- TRUE = vetted, shared across all companies
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- JOBS (a project/contract)
-- ─────────────────────────────────────────────
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  name            TEXT NOT NULL,
  task_type_id    UUID REFERENCES task_types(id),
  total_units     NUMERIC NOT NULL,      -- total units of work to complete
  unit            TEXT NOT NULL,         -- mirrors task_type unit for denorm/speed
  start_date      DATE NOT NULL,
  target_end_date DATE,                  -- bid/contract end date
  status          TEXT DEFAULT 'active', -- active | completed | paused | cancelled

  -- Location data — critical for regional benchmarking
  location_name   TEXT,                  -- e.g. 'Midland, TX' or jobsite address
  city            TEXT,
  state           TEXT,
  country         TEXT DEFAULT 'US',
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  climate_zone    TEXT,                  -- e.g. 'hot-dry', 'humid-subtropical'

  -- Job metadata for richer analytics
  crew_size       INTEGER,
  equipment_notes TEXT,                  -- racking type, panel brand, etc.
  notes           TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- DAILY LOGS — the atomic unit of data collection
-- ─────────────────────────────────────────────
CREATE TABLE daily_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  logged_by       UUID NOT NULL REFERENCES profiles(id),
  log_date        DATE NOT NULL,
  units_completed NUMERIC NOT NULL,      -- units completed this day
  crew_size       INTEGER,               -- actual crew that day (may differ from job default)
  hours_worked    NUMERIC,               -- total crew hours worked

  -- Weather snapshot at time of logging — auto-captured, never manually entered
  weather_temp_f      NUMERIC,           -- temperature in Fahrenheit
  weather_condition   TEXT,              -- 'sunny', 'cloudy', 'rain', 'wind', etc.
  weather_wind_mph    NUMERIC,
  weather_humidity    INTEGER,           -- percent
  weather_precip_in   NUMERIC,           -- precipitation inches

  -- Location snapshot — where they actually were when logging
  log_latitude    NUMERIC(9,6),
  log_longitude   NUMERIC(9,6),

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(job_id, log_date)              -- one log per job per day
);

-- ─────────────────────────────────────────────
-- COMPUTED: JOB SNAPSHOTS (updated on each log)
-- Denormalized for fast dashboard queries
-- ─────────────────────────────────────────────
CREATE TABLE job_snapshots (
  job_id                  UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  units_completed         NUMERIC DEFAULT 0,
  units_remaining         NUMERIC,
  avg_units_per_day       NUMERIC,       -- rolling average
  last_7_day_avg          NUMERIC,       -- trend: recent pace
  estimated_finish_date   DATE,
  days_ahead_behind       INTEGER,       -- positive = ahead, negative = behind schedule
  total_days_logged       INTEGER DEFAULT 0,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
ALTER TABLE companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Companies: members of the company can see it
CREATE POLICY "Company members read company"
  ON companies FOR SELECT
  USING (id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Users can create companies"
  ON companies FOR INSERT WITH CHECK (TRUE);

-- Task types: global ones visible to all, company ones visible to members
CREATE POLICY "Read global or own task types"
  ON task_types FOR SELECT USING (
    is_global = TRUE
    OR created_by = auth.uid()
    OR created_by IN (SELECT id FROM profiles WHERE company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    ))
  );
CREATE POLICY "Authenticated users create task types"
  ON task_types FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Jobs: company members only
CREATE POLICY "Company members read jobs"
  ON jobs FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company members create jobs"
  ON jobs FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Company members update jobs"
  ON jobs FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Daily logs: company members only
CREATE POLICY "Company members read logs"
  ON daily_logs FOR SELECT
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));
CREATE POLICY "Authenticated users create logs"
  ON daily_logs FOR INSERT
  WITH CHECK (logged_by = auth.uid());

-- Job snapshots: same as jobs
CREATE POLICY "Company members read snapshots"
  ON job_snapshots FOR SELECT
  USING (job_id IN (
    SELECT id FROM jobs WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ─────────────────────────────────────────────
-- FUNCTION: Update job snapshot after each log
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_job_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_job              RECORD;
  v_total_completed  NUMERIC;
  v_total_days       INTEGER;
  v_avg              NUMERIC;
  v_last7_avg        NUMERIC;
  v_remaining        NUMERIC;
  v_est_finish       DATE;
  v_days_diff        INTEGER;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;

  SELECT
    COALESCE(SUM(units_completed), 0),
    COUNT(*)
  INTO v_total_completed, v_total_days
  FROM daily_logs
  WHERE job_id = NEW.job_id;

  v_avg := CASE WHEN v_total_days > 0 THEN v_total_completed / v_total_days ELSE 0 END;

  -- Last 7 days average (trend-aware)
  SELECT COALESCE(AVG(units_completed), v_avg) INTO v_last7_avg
  FROM daily_logs
  WHERE job_id = NEW.job_id
    AND log_date >= CURRENT_DATE - INTERVAL '7 days';

  v_remaining := GREATEST(v_job.total_units - v_total_completed, 0);

  -- Use last-7-day average for ETA if we have enough data, else overall avg
  v_est_finish := CASE
    WHEN v_last7_avg > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_last7_avg)::INTEGER
    WHEN v_avg > 0 THEN CURRENT_DATE + CEIL(v_remaining / v_avg)::INTEGER
    ELSE NULL
  END;

  v_days_diff := CASE
    WHEN v_est_finish IS NOT NULL AND v_job.target_end_date IS NOT NULL
    THEN v_job.target_end_date - v_est_finish
    ELSE NULL
  END;

  INSERT INTO job_snapshots (
    job_id, units_completed, units_remaining,
    avg_units_per_day, last_7_day_avg,
    estimated_finish_date, days_ahead_behind, total_days_logged, updated_at
  ) VALUES (
    NEW.job_id, v_total_completed, v_remaining,
    ROUND(v_avg, 2), ROUND(v_last7_avg, 2),
    v_est_finish, v_days_diff, v_total_days, NOW()
  )
  ON CONFLICT (job_id) DO UPDATE SET
    units_completed       = EXCLUDED.units_completed,
    units_remaining       = EXCLUDED.units_remaining,
    avg_units_per_day     = EXCLUDED.avg_units_per_day,
    last_7_day_avg        = EXCLUDED.last_7_day_avg,
    estimated_finish_date = EXCLUDED.estimated_finish_date,
    days_ahead_behind     = EXCLUDED.days_ahead_behind,
    total_days_logged     = EXCLUDED.total_days_logged,
    updated_at            = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_daily_log_insert
  AFTER INSERT OR UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_job_snapshot();

-- ─────────────────────────────────────────────
-- FUNCTION: Create profile + company on signup
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'), 'foreman');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────
-- SEED: Common task types (global)
-- ─────────────────────────────────────────────
INSERT INTO task_types (name, category, unit, is_global) VALUES
  ('Solar panel row installation', 'solar', 'rows', TRUE),
  ('Solar panel installation', 'solar', 'panels', TRUE),
  ('Conduit run', 'electrical', 'feet', TRUE),
  ('Wire pull', 'electrical', 'feet', TRUE),
  ('Fixture installation', 'electrical', 'fixtures', TRUE),
  ('Racking installation', 'solar', 'sections', TRUE),
  ('Trenching', 'civil', 'feet', TRUE),
  ('Concrete pour', 'civil', 'cubic yards', TRUE),
  ('Pipe install', 'plumbing', 'feet', TRUE),
  ('Duct install', 'hvac', 'feet', TRUE),
  ('Drywall hang', 'drywall', 'sheets', TRUE),
  ('Roofing shingles', 'roofing', 'squares', TRUE);
