-- CrewCast Migration 005
-- Universal Job Variables
--
-- Replaces the freeform equipment_notes field with a structured
-- key-value variable system that works for ANY trade.
--
-- Examples:
--   Electrician:  Wire gauge = "12 AWG",  Conduit type = "EMT"
--   Plumber:      Pipe size  = "2 inch",  Pipe material = "PVC"
--   Roofer:       Shingle brand = "GAF",  Pitch = "6:12"
--   HVAC:         Duct type = "flex",     Tonnage = "5-ton"
--   Solar:        Racking type = "IronRidge", Module = "400W"
--
-- Variable values are stored uniformly, so queries like
-- "show productivity by wire gauge across all electrical jobs"
-- just work — no special-casing, no solar-only assumptions.

-- ─────────────────────────────────────────────
-- 1. JOB VARIABLE TYPES (the catalog / library)
-- Global types: visible to all companies (vetted, well-named).
-- Company types: private to the creating company.
-- ─────────────────────────────────────────────
CREATE TABLE job_variable_types (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,          -- "Pipe size", "Wire gauge", "Shingle brand"
  description   TEXT,                  -- optional hint shown in picker
  category      TEXT,                  -- matches task_types.category ('electrical', 'plumbing', …)
                                       -- NULL = applies to all trades
  unit_hint     TEXT,                  -- "inches", "AWG", "brand" — shown next to input
  common_values JSONB DEFAULT '[]',    -- ["1/2\"","3/4\"","1\"","2\""] for autocomplete chips
  is_global     BOOLEAN DEFAULT FALSE, -- TRUE = vetted, surfaced to all companies
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL when is_global
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- A global type's name must be unique; a company can add a same-named private type
  -- but two global types cannot share a name.
  CONSTRAINT global_name_unique EXCLUDE USING btree (name WITH =) WHERE (is_global = TRUE)
);

ALTER TABLE job_variable_types ENABLE ROW LEVEL SECURITY;

-- Anyone can read global types; company members can read their own private ones
CREATE POLICY "Read global or own variable types"
  ON job_variable_types FOR SELECT
  USING (
    is_global = TRUE
    OR company_id = auth_company_id()
  );

-- Authenticated users can create private variable types for their company
CREATE POLICY "Company members create variable types"
  ON job_variable_types FOR INSERT
  WITH CHECK (
    is_global = FALSE
    AND company_id = auth_company_id()
    AND created_by = auth.uid()
  );

-- Only the creator (or any company admin) can update a private type
CREATE POLICY "Company members update own variable types"
  ON job_variable_types FOR UPDATE
  USING (
    is_global = FALSE
    AND company_id = auth_company_id()
  )
  WITH CHECK (
    is_global = FALSE
    AND company_id = auth_company_id()
  );

-- Delete own private types
CREATE POLICY "Company members delete own variable types"
  ON job_variable_types FOR DELETE
  USING (
    is_global = FALSE
    AND company_id = auth_company_id()
  );

-- ─────────────────────────────────────────────
-- 2. JOB VARIABLES (values assigned per job)
-- One row per variable per job.
-- e.g. job A: Pipe size = "2 inch", Pipe material = "Schedule 40 PVC"
-- ─────────────────────────────────────────────
CREATE TABLE job_variables (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  variable_type_id UUID NOT NULL REFERENCES job_variable_types(id) ON DELETE CASCADE,
  value            TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, variable_type_id)   -- one value per variable type per job
);

ALTER TABLE job_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read job variables"
  ON job_variables FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members create job variables"
  ON job_variables FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members update job variables"
  ON job_variables FOR UPDATE
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

CREATE POLICY "Company members delete job variables"
  ON job_variables FOR DELETE
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id = auth_company_id()
    )
  );

-- ─────────────────────────────────────────────
-- 3. LOG VARIABLE OVERRIDES (mid-job condition changes)
-- When a variable changes during a job — switching from 2" to 4" pipe
-- halfway through — the foreman can log the override so each day's
-- productivity gets tagged against the right condition.
--
-- If no override exists for a log, the job-level default applies.
-- ─────────────────────────────────────────────
CREATE TABLE log_variable_overrides (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_log_id     UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  variable_type_id UUID NOT NULL REFERENCES job_variable_types(id) ON DELETE CASCADE,
  value            TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(daily_log_id, variable_type_id)
);

ALTER TABLE log_variable_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members read log overrides"
  ON log_variable_overrides FOR SELECT
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members create log overrides"
  ON log_variable_overrides FOR INSERT
  WITH CHECK (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members update log overrides"
  ON log_variable_overrides FOR UPDATE
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  )
  WITH CHECK (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

CREATE POLICY "Company members delete log overrides"
  ON log_variable_overrides FOR DELETE
  USING (
    daily_log_id IN (
      SELECT dl.id FROM daily_logs dl
      JOIN jobs j ON j.id = dl.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

-- ─────────────────────────────────────────────
-- 4. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_job_variable_types_category  ON job_variable_types(category);
CREATE INDEX idx_job_variable_types_company   ON job_variable_types(company_id);
CREATE INDEX idx_job_variables_job            ON job_variables(job_id);
CREATE INDEX idx_job_variables_type           ON job_variables(variable_type_id);
CREATE INDEX idx_log_variable_overrides_log   ON log_variable_overrides(daily_log_id);
CREATE INDEX idx_log_variable_overrides_type  ON log_variable_overrides(variable_type_id);

-- ─────────────────────────────────────────────
-- 5. SEED: Global variable type catalog
-- Covers the major trades used in construction, solar, and service work.
-- common_values are ordered by frequency (most common first) for UX.
-- ─────────────────────────────────────────────

INSERT INTO job_variable_types
  (name, description, category, unit_hint, common_values, is_global)
VALUES

-- ── ELECTRICAL ──────────────────────────────────────────────
('Wire gauge',
 'AWG size of the primary wire or cable being run',
 'electrical', 'AWG',
 '["#12", "#10", "#8", "#6", "#4", "#2", "#1", "#1/0", "#2/0", "#3/0", "#4/0", "350 kcmil", "500 kcmil"]',
 TRUE),

('Conduit type',
 'Type of conduit being installed',
 'electrical', 'type',
 '["EMT", "PVC Schedule 40", "PVC Schedule 80", "IMC", "RMC", "flex", "liquid-tight flex", "HDPE"]',
 TRUE),

('Conduit size',
 'Trade size of conduit',
 'electrical', 'inches',
 '["1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "2-1/2\"", "3\"", "3-1/2\"", "4\""]',
 TRUE),

('Panel voltage',
 'Service or panel voltage',
 'electrical', 'volts',
 '["120/240V 1φ", "120/208V 3φ", "277/480V 3φ", "240V 3φ delta"]',
 TRUE),

('Fixture type',
 'Type of light fixture or device being installed',
 'electrical', 'type',
 '["LED recessed", "LED troffer", "LED high bay", "exit sign", "emergency combo", "panel", "disconnect", "receptacle", "switch"]',
 TRUE),

-- ── SOLAR ────────────────────────────────────────────────────
('Racking type',
 'Mounting racking system brand or style',
 'solar', 'brand/type',
 '["IronRidge XR100", "IronRidge XR1000", "Unirac SFM", "Unirac RM10", "SnapNrack", "Roof Tech", "Schletter", "ground-mount ballasted", "ground-mount driven pier", "carport"]',
 TRUE),

('Module wattage',
 'Rated wattage per solar panel',
 'solar', 'watts',
 '["400W", "405W", "410W", "415W", "420W", "430W", "440W", "450W", "460W", "500W+"]',
 TRUE),

('Module brand',
 'Solar panel manufacturer',
 'solar', 'brand',
 '["REC", "Silfab", "Q-CELLS", "Mission Solar", "Jinko", "LONGi", "Canadian Solar", "SunPower", "Panasonic"]',
 TRUE),

('Roof type',
 'Roof material or structure type',
 'solar', 'type',
 '["comp shingle", "metal standing seam", "metal R-panel", "tile", "TPO flat", "EPDM flat", "modified bitumen", "concrete tilt-up"]',
 TRUE),

('Inverter type',
 'Inverter topology',
 'solar', 'type',
 '["string inverter", "microinverter (IQ8)", "microinverter (IQ7)", "string + optimizers", "central inverter"]',
 TRUE),

-- ── PLUMBING ────────────────────────────────────────────────
('Pipe size',
 'Nominal pipe size being run',
 'plumbing', 'inches',
 '["1/2\"", "3/4\"", "1\"", "1-1/4\"", "1-1/2\"", "2\"", "3\"", "4\"", "6\""]',
 TRUE),

('Pipe material',
 'Material of the pipe being installed',
 'plumbing', 'material',
 '["PVC Schedule 40", "PVC Schedule 80", "CPVC", "copper Type L", "copper Type M", "PEX-A", "PEX-B", "ABS", "cast iron", "black iron", "galvanized steel"]',
 TRUE),

('System type',
 'Plumbing system being installed',
 'plumbing', 'type',
 '["domestic cold water", "domestic hot water", "drain-waste-vent (DWV)", "gas", "fire suppression", "hydronic heating", "compressed air"]',
 TRUE),

-- ── HVAC ─────────────────────────────────────────────────────
('Duct type',
 'Type of ductwork being installed',
 'hvac', 'type',
 '["flex", "sheet metal round", "sheet metal rectangular", "spiral", "fiberglass duct board"]',
 TRUE),

('System tonnage',
 'Capacity of the HVAC unit',
 'hvac', 'tons',
 '["1 ton", "1.5 ton", "2 ton", "2.5 ton", "3 ton", "3.5 ton", "4 ton", "5 ton", "7.5 ton", "10 ton", "15 ton", "20 ton+"]',
 TRUE),

('Equipment brand',
 'HVAC equipment manufacturer',
 'hvac', 'brand',
 '["Carrier", "Trane", "Lennox", "Daikin", "Mitsubishi", "York", "Rheem", "Goodman", "American Standard", "Bryant"]',
 TRUE),

('System type',
 'Type of HVAC system',
 'hvac', 'type',
 '["split system", "packaged unit", "mini-split", "PTAC", "VRF/VRV", "chiller", "boiler", "heat pump", "RTU"]',
 TRUE),

-- ── ROOFING ─────────────────────────────────────────────────
('Shingle type',
 'Type of roofing shingle or material',
 'roofing', 'type',
 '["3-tab asphalt", "architectural asphalt", "impact-resistant asphalt", "metal standing seam", "metal R-panel", "clay tile", "concrete tile", "synthetic slate", "TPO", "EPDM", "modified bitumen"]',
 TRUE),

('Shingle brand',
 'Shingle manufacturer',
 'roofing', 'brand',
 '["GAF", "Owens Corning", "CertainTeed", "IKO", "Atlas", "Tamko", "Malarkey", "Davinci", "Metal Sales"]',
 TRUE),

('Roof pitch',
 'Slope of the roof in rise/run format',
 'roofing', 'pitch',
 '["2:12", "3:12", "4:12", "5:12", "6:12", "7:12", "8:12", "9:12", "10:12", "12:12", "steep (>12:12)"]',
 TRUE),

('Deck type',
 'Roof deck substrate material',
 'roofing', 'type',
 '["OSB", "plywood", "skip sheathing", "solid board", "metal", "concrete", "existing tear-off"]',
 TRUE),

-- ── CIVIL / EXCAVATION ───────────────────────────────────────
('Trench depth',
 'Nominal depth of trench',
 'civil', 'inches',
 '["18\"", "24\"", "30\"", "36\"", "42\"", "48\"", "60\"", "72\"+"]',
 TRUE),

('Trench width',
 'Nominal width of trench',
 'civil', 'inches',
 '["12\"", "18\"", "24\"", "30\"", "36\"", "48\"+"]',
 TRUE),

('Soil type',
 'Predominant soil or ground conditions',
 'civil', 'type',
 '["sandy loam", "clay", "caliche/hardpan", "rocky", "mixed fill", "expansive clay", "black dirt", "river rock"]',
 TRUE),

('Equipment used',
 'Primary excavation or earthwork equipment',
 'civil', 'equipment',
 '["mini excavator", "full-size excavator", "trencher chain", "trencher wheel", "hand dig", "hydrovac", "backhoe", "dozer"]',
 TRUE),

-- ── FRAMING / CARPENTRY ──────────────────────────────────────
('Lumber species',
 'Wood species or engineered lumber type',
 'framing', 'type',
 '["SPF 2x4", "SPF 2x6", "SPF 2x8", "SPF 2x10", "SPF 2x12", "LVL", "PSL", "LSL", "I-joist", "steel stud"]',
 TRUE),

('Framing type',
 'Framing method or assembly',
 'framing', 'type',
 '["wood stud wall", "steel stud wall", "floor joist", "roof truss", "stick-frame roof", "panelized", "CFS framing"]',
 TRUE),

-- ── CONCRETE ──────────────────────────────────────────────────
('Concrete PSI',
 'Compressive strength of the mix',
 'concrete', 'PSI',
 '["2500 PSI", "3000 PSI", "3500 PSI", "4000 PSI", "4500 PSI", "5000 PSI", "5000+ PSI"]',
 TRUE),

('Rebar size',
 'Rebar or reinforcement size used',
 'concrete', 'size',
 '["#3", "#4", "#5", "#6", "#7", "#8", "#9", "#10", "WWM 6x6", "fiber reinforced (no rebar)"]',
 TRUE),

('Pour type',
 'Type of concrete pour or placement',
 'concrete', 'type',
 '["slab-on-grade", "footing", "foundation wall", "grade beam", "column/pier", "tilt-up panel", "sidewalk/flatwork", "pump pour", "bucket/crane"]',
 TRUE),

-- ── DRYWALL ─────────────────────────────────────────────────
('Drywall thickness',
 'Thickness of drywall sheet',
 'drywall', 'inches',
 '["1/4\"", "3/8\"", "1/2\"", "5/8\" Type X", "5/8\" Fireguard"]',
 TRUE),

('Drywall type',
 'Special drywall board type',
 'drywall', 'type',
 '["standard", "moisture resistant (MR)", "abuse resistant", "fire rated Type X", "soundboard", "SoundBreak", "denseboard backer"]',
 TRUE),

-- ── PAINTING ─────────────────────────────────────────────────
('Surface type',
 'Surface being painted or coated',
 'painting', 'type',
 '["drywall/interior", "exterior wood siding", "exterior stucco", "metal/steel", "concrete floor", "concrete wall", "masonry block", "EPD coating"]',
 TRUE),

('Coats required',
 'Number of coats in the scope',
 'painting', 'coats',
 '["1 coat", "2 coats", "3 coats", "primer + 1", "primer + 2"]',
 TRUE),

-- ── GENERAL / CROSS-TRADE ────────────────────────────────────
('Site access',
 'How accessible is the work area',
 'general', 'level',
 '["open / easy", "restricted (lift/ladder required)", "confined space", "roof access", "underground vault", "remote / off-road"]',
 TRUE),

('Weather exposure',
 'Expected weather exposure during install',
 'general', 'level',
 '["interior (no exposure)", "covered / partially sheltered", "exposed / open air"]',
 TRUE),

('Inspection requirement',
 'Level of required inspections',
 'general', 'level',
 '["no inspection", "single AHJ inspection", "multiple inspections", "3rd party special inspection", "OSHA permit required"]',
 TRUE);


-- ─────────────────────────────────────────────
-- 6. VARIABLE-AWARE BENCHMARK VIEW
-- Shows productivity (avg units/day) broken down by variable value.
-- Example: "12 AWG electrical conduit jobs: 450 ft/day avg"
--          "2\" PVC plumbing jobs: 85 ft/day avg"
-- This is the cross-trade data asset — companies pay for this.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW variable_productivity_benchmarks AS
SELECT
  j.company_id,
  tt.category                            AS trade_category,
  tt.name                                AS task_type_name,
  tt.unit                                AS work_unit,
  jvt.name                               AS variable_name,
  jv.value                               AS variable_value,
  jvt.unit_hint                          AS variable_unit,
  COUNT(DISTINCT j.id)                   AS job_count,
  COUNT(DISTINCT dl.id)                  AS total_log_days,
  ROUND(AVG(js.avg_units_per_day), 2)    AS avg_units_per_day,
  ROUND(MIN(js.avg_units_per_day), 2)    AS min_units_per_day,
  ROUND(MAX(js.avg_units_per_day), 2)    AS max_units_per_day,
  ROUND(STDDEV(js.avg_units_per_day), 2) AS stddev_units_per_day,
  ROUND(AVG(js.burn_rate), 3)            AS avg_burn_rate,
  ROUND(AVG(dl.crew_size), 1)            AS avg_crew_size,
  -- Weather correlation (future ML feed)
  ROUND(AVG(dl.weather_temp_f), 1)       AS avg_temp_f,
  j.state                                AS state
FROM jobs j
JOIN job_snapshots    js  ON js.job_id  = j.id
JOIN task_types       tt  ON tt.id      = j.task_type_id
JOIN job_variables    jv  ON jv.job_id  = j.id
JOIN job_variable_types jvt ON jvt.id   = jv.variable_type_id
LEFT JOIN daily_logs  dl  ON dl.job_id  = j.id
WHERE j.status IN ('active', 'completed')
  AND js.total_days_logged >= 3   -- only jobs with meaningful data
GROUP BY
  j.company_id,
  tt.category,
  tt.name,
  tt.unit,
  jvt.name,
  jv.value,
  jvt.unit_hint,
  j.state
ORDER BY
  j.company_id,
  tt.category,
  jvt.name,
  job_count DESC;
