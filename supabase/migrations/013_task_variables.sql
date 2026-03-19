-- CrewCast Migration 012
-- Task Variables
--
-- Adds a structured variable system at the task level, mirroring job_variables.
-- Variables use the existing job_variable_types catalog (global + company-specific).
-- When a user creates a new variable type that doesn't exist in the catalog,
-- it is saved as a company-scoped type (is_global = FALSE) and becomes
-- immediately available to all members of that company.
--
-- Examples:
--   Task "Wire pull"    → Wire gauge: 12 AWG, Conduit type: EMT
--   Task "Panel mount"  → Panel brand: Qcells, Module wattage: 400W
--   Task "Trench dig"   → Soil type: Rocky, Trench depth: 36 in

-- ─────────────────────────────────────────────
-- 1. TASK VARIABLES (variable values per task)
-- ─────────────────────────────────────────────
CREATE TABLE task_variables (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id          UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  variable_type_id UUID NOT NULL REFERENCES job_variable_types(id) ON DELETE CASCADE,
  value            TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, variable_type_id)  -- one value per variable type per task
);

ALTER TABLE task_variables ENABLE ROW LEVEL SECURITY;

-- Company members can read task variables that belong to their company's jobs
CREATE POLICY "Company members read task variables"
  ON task_variables FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

-- Company members can insert task variables for their company's tasks
CREATE POLICY "Company members insert task variables"
  ON task_variables FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

-- Company members can update task variables for their company's tasks
CREATE POLICY "Company members update task variables"
  ON task_variables FOR UPDATE
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

-- Company members can delete task variables for their company's tasks
CREATE POLICY "Company members delete task variables"
  ON task_variables FOR DELETE
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN jobs j ON j.id = t.job_id
      WHERE j.company_id = auth_company_id()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_task_variables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_variables_updated_at
  BEFORE UPDATE ON task_variables
  FOR EACH ROW EXECUTE FUNCTION update_task_variables_updated_at();
