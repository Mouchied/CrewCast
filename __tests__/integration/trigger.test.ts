/**
 * Integration tests for the update_job_snapshot() trigger.
 *
 * The trigger fires AFTER INSERT on daily_logs and recalculates
 * earned-value metrics (EV%, burn rate, pace status, rolling ETAs)
 * for the affected job.  These tests verify correctness across all
 * paths in migration 011 (the current trigger definition), including:
 *
 *   Legacy mode  — no tasks with total_units; sums daily_logs directly
 *   Task-composite mode — at least one task has total_units > 0;
 *                         expresses progress in effective job-units
 *   Edge cases   — zero units, first day, starting offsets, variable-only tasks
 *
 * Prerequisites (all three env vars must be set, else every test is skipped):
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   TEST_SUPABASE_SERVICE_ROLE_KEY
 *
 * Tests use the service-role client for data setup so RLS does not
 * interfere — we're testing trigger logic, not security boundaries.
 * A real profile row is still required for the logged_by FK.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  RLS_TESTS_ENABLED,
  makeServiceClient,
  createTestUser,
  cleanupTestUser,
  type TestUser,
} from '../rls/helpers';

// ─── conditional suite ───────────────────────────────────────────────────────

const describeSuite = RLS_TESTS_ENABLED ? describe : describe.skip;

// ─── tiny local helpers ──────────────────────────────────────────────────────

interface JobOptions {
  totalUnits?: number;
  startDate?: string;
  targetEndDate?: string | null;
  bidHours?: number | null;
  startingUnitsCompleted?: number;
  startingHoursUsed?: number;
}

async function createJob(
  svc: SupabaseClient,
  companyId: string,
  userId: string,
  opts: JobOptions = {},
): Promise<string> {
  const {
    totalUnits = 100,
    startDate = '2026-01-01',
    targetEndDate = null,
    bidHours = null,
    startingUnitsCompleted = 0,
    startingHoursUsed = 0,
  } = opts;

  const row: Record<string, unknown> = {
    company_id: companyId,
    created_by: userId,
    name: `Trigger Test Job ${Date.now()}`,
    total_units: totalUnits,
    unit: 'panels',
    start_date: startDate,
    starting_units_completed: startingUnitsCompleted,
    starting_hours_used: startingHoursUsed,
  };
  if (targetEndDate !== null) row.target_end_date = targetEndDate;
  if (bidHours !== null) row.bid_hours = bidHours;

  const { data, error } = await svc.from('jobs').insert(row).select('id').single();
  if (error || !data) throw new Error(`createJob: ${error?.message}`);
  return data.id;
}

interface TaskOptions {
  totalUnits?: number | null;
  startingUnitsCompleted?: number;
  sequenceOrder?: number;
}

async function createTask(
  svc: SupabaseClient,
  jobId: string,
  opts: TaskOptions = {},
): Promise<string> {
  const { totalUnits = null, startingUnitsCompleted = 0, sequenceOrder = 1 } = opts;
  const row: Record<string, unknown> = {
    job_id: jobId,
    name: `Task ${Date.now()}`,
    sequence_order: sequenceOrder,
    starting_units_completed: startingUnitsCompleted,
  };
  if (totalUnits !== null) row.total_units = totalUnits;

  const { data, error } = await svc.from('tasks').insert(row).select('id').single();
  if (error || !data) throw new Error(`createTask: ${error?.message}`);
  return data.id;
}

interface LogOptions {
  taskId?: string | null;
  hoursWorked?: number | null;
}

async function insertLog(
  svc: SupabaseClient,
  jobId: string,
  userId: string,
  logDate: string,
  unitsCompleted: number,
  opts: LogOptions = {},
): Promise<string> {
  const row: Record<string, unknown> = {
    job_id: jobId,
    logged_by: userId,
    log_date: logDate,
    units_completed: unitsCompleted,
  };
  if (opts.taskId != null) row.task_id = opts.taskId;
  if (opts.hoursWorked != null) row.hours_worked = opts.hoursWorked;

  const { data, error } = await svc.from('daily_logs').insert(row).select('id').single();
  if (error || !data) throw new Error(`insertLog: ${error?.message}`);
  return data.id;
}

interface Snapshot {
  units_completed: number;
  units_remaining: number;
  avg_units_per_day: number;
  last_7_day_avg: number;
  estimated_finish_date: string | null;
  days_ahead_behind: number | null;
  total_days_logged: number;
  total_hours_worked: number;
  bid_hours: number | null;
  earned_value_pct: number;
  planned_value_pct: number | null;
  burn_rate: number | null;
  hours_variance: number | null;
  forecast_hours_at_completion: number | null;
  pace_status: string;
}

async function getSnapshot(svc: SupabaseClient, jobId: string): Promise<Snapshot> {
  const { data, error } = await svc
    .from('job_snapshots')
    .select('*')
    .eq('job_id', jobId)
    .single();
  if (error || !data) throw new Error(`getSnapshot: ${error?.message}`);
  return data as Snapshot;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describeSuite('update_job_snapshot() trigger', () => {
  let svc: SupabaseClient;
  let user: TestUser;

  // Unique email suffix so parallel test runs don't collide.
  const run = Date.now();

  // Dates relative to today (2026-04-11 per session context).
  // Use a recent date so logs fall inside the 7-day rolling window.
  const TODAY = '2026-04-11';
  const RECENT = '2026-04-10'; // within last 7 days
  const OLD = '2026-01-15';    // outside last 7 days

  beforeAll(async () => {
    svc = makeServiceClient();
    user = await createTestUser(
      svc,
      `qa-trigger-${run}@crewcast-test.invalid`,
      `Trigger Test Co ${run}`,
    );
  });

  afterAll(async () => {
    await cleanupTestUser(svc, user);
  });

  // ── LEGACY MODE ────────────────────────────────────────────────────────────

  describe('legacy mode (no tasks with total_units)', () => {

    it('creates snapshot on first log insert', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startDate: '2026-01-01',
      });
      await insertLog(svc, jobId, user.id, RECENT, 25);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBe(25);
      expect(snap.units_remaining).toBe(75);
      expect(snap.avg_units_per_day).toBe(25);
      expect(snap.last_7_day_avg).toBe(25);
      expect(snap.total_days_logged).toBe(1);
      expect(snap.earned_value_pct).toBe(25);
      expect(snap.pace_status).toBe('no_target'); // no target_end_date
      expect(snap.burn_rate).toBeNull();           // no bid_hours
      // ETA: CURRENT_DATE + ceil(75/25) = today + 3
      expect(snap.estimated_finish_date).not.toBeNull();
    });

    it('handles zero units: no velocity, no ETA', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      await insertLog(svc, jobId, user.id, RECENT, 0);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBe(0);
      expect(snap.units_remaining).toBe(100);
      expect(snap.avg_units_per_day).toBe(0);
      expect(snap.last_7_day_avg).toBe(0);
      expect(snap.estimated_finish_date).toBeNull();
      expect(snap.earned_value_pct).toBe(0);
    });

    it('accumulates units across multiple log entries', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 200,
      });
      // Three logs on distinct days: 20 + 30 + 50 = 100
      await insertLog(svc, jobId, user.id, '2026-04-07', 20);
      await insertLog(svc, jobId, user.id, '2026-04-08', 30);
      await insertLog(svc, jobId, user.id, '2026-04-09', 50);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBe(100);
      expect(snap.units_remaining).toBe(100);
      expect(snap.total_days_logged).toBe(3);
      // avg = 100 / 3 = 33.33
      expect(snap.avg_units_per_day).toBeCloseTo(33.33, 1);
      expect(snap.earned_value_pct).toBe(50);
    });

    it('pace_status = on_track when ETA is well before deadline', async () => {
      // 100 units total, target = 2026-04-30 (19 days from today)
      // Log 50 units → remaining 50, velocity 50/day, ETA = today + 1
      // days_diff = 2026-04-30 - (today+1) = 18 → on_track (>= 2)
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startDate: '2026-01-01',
        targetEndDate: '2026-04-30',
      });
      await insertLog(svc, jobId, user.id, RECENT, 50);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.pace_status).toBe('on_track');
      expect(snap.days_ahead_behind).toBeGreaterThanOrEqual(2);
    });

    it('pace_status = behind when ETA far exceeds deadline', async () => {
      // 100 units, target = today, only 1 unit logged → ETA ~99 days away
      // days_diff = today - (today+99) = -99 → behind (< -3)
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startDate: '2026-01-01',
        targetEndDate: TODAY,
      });
      await insertLog(svc, jobId, user.id, RECENT, 1);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.pace_status).toBe('behind');
      expect(snap.days_ahead_behind).toBeLessThan(-3);
    });

    it('pace_status = at_risk when ETA is just past deadline', async () => {
      // 100 units, target = tomorrow (2026-04-12)
      // Log 50 → remaining 50, velocity 50/day, ETA = today+1 = 2026-04-12 (same as target)
      // days_diff = 2026-04-12 - 2026-04-12 = 0 → at_risk (>= -3 but < 2)
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startDate: '2026-01-01',
        targetEndDate: '2026-04-12',
      });
      await insertLog(svc, jobId, user.id, RECENT, 50);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.pace_status).toBe('at_risk');
      expect(snap.days_ahead_behind).toBeGreaterThanOrEqual(-3);
      expect(snap.days_ahead_behind).toBeLessThan(2);
    });

    it('pace_status = no_target when job has no target_end_date', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        targetEndDate: null,
      });
      await insertLog(svc, jobId, user.id, RECENT, 50);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.pace_status).toBe('no_target');
      expect(snap.days_ahead_behind).toBeNull();
    });

    it('calculates burn rate, hours_variance, and forecast when bid_hours set', async () => {
      // Job: 100 units, bid_hours = 1000
      // Log: 10 units, 80 hours
      // ev_pct = 10%, earned_hours = 100, burn_rate = 80/100 = 0.800
      // hours_variance = 100 - 80 = 20.0
      // forecast_final = 0.800 * 1000 = 800
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        bidHours: 1000,
      });
      await insertLog(svc, jobId, user.id, RECENT, 10, { hoursWorked: 80 });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.earned_value_pct).toBe(10);
      expect(snap.total_hours_worked).toBe(80);
      expect(snap.bid_hours).toBe(1000);
      expect(snap.burn_rate).toBeCloseTo(0.8, 2);
      expect(snap.hours_variance).toBeCloseTo(20, 0);
      expect(snap.forecast_hours_at_completion).toBe(800);
    });

    it('burn_rate is null when no bid_hours', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        bidHours: null,
      });
      await insertLog(svc, jobId, user.id, RECENT, 10, { hoursWorked: 80 });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.burn_rate).toBeNull();
      expect(snap.forecast_hours_at_completion).toBeNull();
    });

    it('applies job-level starting unit and hour offsets', async () => {
      // starting_units_completed=30, starting_hours_used=20
      // Log 20 units, 5 hours
      // total_completed = 20 + 30 = 50, total_hours = 5 + 20 = 25
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startingUnitsCompleted: 30,
        startingHoursUsed: 20,
      });
      await insertLog(svc, jobId, user.id, RECENT, 20, { hoursWorked: 5 });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBe(50);
      expect(snap.total_hours_worked).toBe(25);
      expect(snap.earned_value_pct).toBe(50);
    });

    it('7-day rolling average falls back to overall avg for old logs', async () => {
      // Log on OLD date (outside 7-day window): 40 units
      // 7-day window has no rows → last_7_avg falls back to v_avg_units = 40
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 200,
      });
      await insertLog(svc, jobId, user.id, OLD, 40);

      const snap = await getSnapshot(svc, jobId);
      // avg_units = 40/1 = 40; last_7_day_avg also 40 (fallback)
      expect(snap.avg_units_per_day).toBe(40);
      expect(snap.last_7_day_avg).toBe(40);
    });

    it('last_7_day_avg reflects only recent logs when both old and new exist', async () => {
      // Old log: 10 units; Recent log: 90 units
      // Overall avg = 100/2 = 50; last_7_avg = 90/1 = 90
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 1000,
      });
      await insertLog(svc, jobId, user.id, OLD, 10);
      await insertLog(svc, jobId, user.id, RECENT, 90);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.avg_units_per_day).toBe(50);
      expect(snap.last_7_day_avg).toBe(90);
    });

    it('units_remaining floors at 0 when job is over-complete', async () => {
      // 100 unit job, log 150 units
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      await insertLog(svc, jobId, user.id, RECENT, 150);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_remaining).toBe(0);
      expect(snap.units_completed).toBe(150);
    });

    it('planned_value_pct is null when no target_end_date', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        targetEndDate: null,
      });
      await insertLog(svc, jobId, user.id, RECENT, 10);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.planned_value_pct).toBeNull();
    });

    it('planned_value_pct is set when start_date and target_end_date are present', async () => {
      // start='2026-01-01', target='2026-12-31' (365 day timeline)
      // elapsed = CURRENT_DATE - 2026-01-01 = ~100 days
      // pv_pct = min(100/365 * 100, 100) ≈ 27.4%
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startDate: '2026-01-01',
        targetEndDate: '2026-12-31',
      });
      await insertLog(svc, jobId, user.id, RECENT, 10);

      const snap = await getSnapshot(svc, jobId);
      expect(snap.planned_value_pct).not.toBeNull();
      expect(snap.planned_value_pct!).toBeGreaterThan(0);
      expect(snap.planned_value_pct!).toBeLessThanOrEqual(100);
    });
  });

  // ── TASK-COMPOSITE MODE ────────────────────────────────────────────────────

  describe('task-composite mode (tasks with total_units)', () => {

    it('switches to task mode when a task has total_units', async () => {
      // Job: 200 units; Task: total_units=50
      // Log 25 units on task → completed = 25/50 of task-units
      // v_log_completed = (25/50) * 200 = 100 effective units
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 200,
      });
      const taskId = await createTask(svc, jobId, { totalUnits: 50, sequenceOrder: 1 });
      await insertLog(svc, jobId, user.id, RECENT, 25, { taskId });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBeCloseTo(100, 0);
      expect(snap.earned_value_pct).toBe(50);
    });

    it('composites progress across multiple tasks', async () => {
      // Job: 100 units; Task A: 50, Task B: 50 → total_task_units=100
      // Log 25 on A, 25 on B → completed=50/100=50%
      // v_log_completed = (50/100)*100 = 50 effective units
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      const taskA = await createTask(svc, jobId, { totalUnits: 50, sequenceOrder: 1 });
      const taskB = await createTask(svc, jobId, { totalUnits: 50, sequenceOrder: 2 });
      await insertLog(svc, jobId, user.id, '2026-04-09', 25, { taskId: taskA });
      await insertLog(svc, jobId, user.id, RECENT, 25, { taskId: taskB });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBeCloseTo(50, 0);
      expect(snap.earned_value_pct).toBe(50);
    });

    it('applies per-task starting offset (migration 011)', async () => {
      // Task: total_units=50, starting_units_completed=10
      // Log 20 → completed_task_units = 20+10 = 30
      // v_log_completed = (30/50)*100 = 60 effective units
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      const taskId = await createTask(svc, jobId, {
        totalUnits: 50,
        startingUnitsCompleted: 10,
        sequenceOrder: 1,
      });
      await insertLog(svc, jobId, user.id, RECENT, 20, { taskId });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBeCloseTo(60, 0);
      expect(snap.earned_value_pct).toBe(60);
    });

    it('ignores variable-only tasks (total_units=null) in composite calculation', async () => {
      // A task with null total_units should not enter task-mode.
      // Logs (not linked to a task) should be summed in legacy mode.
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      // This task has NO total_units — should not trigger task mode
      await createTask(svc, jobId, { totalUnits: null, sequenceOrder: 1 });
      await insertLog(svc, jobId, user.id, RECENT, 40);

      const snap = await getSnapshot(svc, jobId);
      // Legacy mode: units = 40
      expect(snap.units_completed).toBe(40);
      expect(snap.earned_value_pct).toBe(40);
    });

    it('logs against variable-only tasks are excluded from composite, units-tasks are included', async () => {
      // Task A has total_units=100 → enters task mode
      // Task B has total_units=null (variable-only)
      // Log 50 on task A, 9999 on task B
      // Only task A counts: completed=50/100=50% → 50 effective units
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      const taskA = await createTask(svc, jobId, { totalUnits: 100, sequenceOrder: 1 });
      const taskB = await createTask(svc, jobId, { totalUnits: null, sequenceOrder: 2 });
      await insertLog(svc, jobId, user.id, '2026-04-09', 50, { taskId: taskA });
      await insertLog(svc, jobId, user.id, RECENT, 9999, { taskId: taskB });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBeCloseTo(50, 0);
      expect(snap.earned_value_pct).toBe(50);
    });

    it('task-mode velocity falls back to overall avg when no recent logs', async () => {
      // Log on OLD date only → 7-day window is empty → last_7_avg = overall avg
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 200,
      });
      const taskId = await createTask(svc, jobId, { totalUnits: 100, sequenceOrder: 1 });
      await insertLog(svc, jobId, user.id, OLD, 50, { taskId });

      const snap = await getSnapshot(svc, jobId);
      // log_completed = (50/100)*200 = 100; avg = 100/1 = 100
      expect(snap.avg_units_per_day).toBe(100);
      expect(snap.last_7_day_avg).toBe(100); // fallback = overall avg
    });

    it('task-mode + burn rate calculations work together', async () => {
      // Job: 100 units, bid_hours=500; Task: 100 units
      // Log 25 units, 100 hours
      // effective = (25/100)*100 = 25, ev_pct=25%
      // earned_hours = 0.25*500 = 125; burn_rate = 100/125 = 0.800
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        bidHours: 500,
      });
      const taskId = await createTask(svc, jobId, { totalUnits: 100, sequenceOrder: 1 });
      await insertLog(svc, jobId, user.id, RECENT, 25, { taskId, hoursWorked: 100 });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.earned_value_pct).toBe(25);
      expect(snap.burn_rate).toBeCloseTo(0.8, 2);
      expect(snap.hours_variance).toBeCloseTo(25, 0);
    });

    it('task-mode combined with job-level starting offsets', async () => {
      // Job: 100 units, starting_units_completed=20
      // Task: total_units=100
      // Log 30 → effective = (30/100)*100 = 30; v_total_completed = 30+20 = 50
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
        startingUnitsCompleted: 20,
      });
      const taskId = await createTask(svc, jobId, { totalUnits: 100, sequenceOrder: 1 });
      await insertLog(svc, jobId, user.id, RECENT, 30, { taskId });

      const snap = await getSnapshot(svc, jobId);
      expect(snap.units_completed).toBeCloseTo(50, 0);
      expect(snap.earned_value_pct).toBe(50);
    });
  });

  // ── SNAPSHOT UPSERT ────────────────────────────────────────────────────────

  describe('snapshot upsert behaviour', () => {
    it('subsequent inserts update the existing snapshot row (not duplicate)', async () => {
      const jobId = await createJob(svc, user.companyId, user.id, {
        totalUnits: 100,
      });
      await insertLog(svc, jobId, user.id, '2026-04-08', 10);
      await insertLog(svc, jobId, user.id, '2026-04-09', 20);

      // Verify only one snapshot row exists (ON CONFLICT upsert)
      const { data, error } = await svc
        .from('job_snapshots')
        .select('*')
        .eq('job_id', jobId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      // Second log was trigger, so snapshot reflects both logs
      expect(data![0].units_completed).toBe(30);
    });
  });
});
