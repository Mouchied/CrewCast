import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Task } from '../types';

export interface LogCrewAssignment {
  id: string;
  hours_worked: number | null;
  crew_members: {
    id: string;
    name: string;
  } | null;
}

export interface TaskDetailLog {
  id: string;
  log_date: string;
  logged_by: string;
  units_completed: number;
  hours_worked: number | null;
  notes: string | null;
  log_crew_assignments: LogCrewAssignment[];
  profile_name: string;
  running_total: number;
}

export interface CrewSummaryEntry {
  id: string;
  name: string;
  totalHours: number;
}

export interface TaskDetailResult {
  task: Task | null;
  logs: TaskDetailLog[];
  loading: boolean;
  error: string | null;
  totalLogged: number;
  percentComplete: number;
  avgPerDay: number;
  last7DayAvg: number;
  estimatedFinish: string | null;
  crewSummary: CrewSummaryEntry[];
  fetchData: () => Promise<void>;
}

export function useTaskDetail(
  jobId: string | undefined,
  taskId: string | undefined
): TaskDetailResult {
  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<TaskDetailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    if (!jobId || !taskId) return;
    setLoading(true);
    setError(null);

    const [{ data: taskData, error: taskErr }, { data: logData, error: logErr }] =
      await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .eq('job_id', jobId)
          .single(),
        supabase
          .from('daily_logs')
          .select(
            'id, log_date, logged_by, units_completed, hours_worked, notes, log_crew_assignments(id, hours_worked, crew_members(id, name))'
          )
          .eq('job_id', jobId)
          .eq('task_id', taskId)
          .order('log_date', { ascending: false }),
      ]);

    if (taskErr) {
      setError(taskErr.message);
      setLoading(false);
      return;
    }
    if (logErr) {
      setError(logErr.message);
      setLoading(false);
      return;
    }

    // Fetch display names for all loggers
    const loggerIds = [...new Set((logData ?? []).map((l) => l.logged_by))];
    let profileMap: Record<string, string> = {};
    if (loggerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', loggerIds);
      if (profiles) {
        profileMap = profiles.reduce(
          (acc, p) => { acc[p.id] = p.full_name; return acc; },
          {} as Record<string, string>
        );
      }
    }

    // Compute running totals in ascending date order, then map back
    const ascending = [...(logData ?? [])].reverse();
    let cumulative = taskData?.starting_units_completed ?? 0;
    const runningTotalsMap: Record<string, number> = {};
    for (const log of ascending) {
      cumulative += log.units_completed ?? 0;
      runningTotalsMap[log.id] = cumulative;
    }

    const typedLogs: TaskDetailLog[] = (logData ?? []).map((log) => ({
      id: log.id,
      log_date: log.log_date,
      logged_by: log.logged_by,
      units_completed: log.units_completed,
      hours_worked: log.hours_worked,
      notes: log.notes,
      log_crew_assignments: (log.log_crew_assignments ?? []) as unknown as LogCrewAssignment[],
      profile_name: profileMap[log.logged_by] ?? 'Unknown',
      running_total: runningTotalsMap[log.id] ?? 0,
    }));

    setTask(taskData ?? null);
    setLogs(typedLogs);
    setLoading(false);
  }

  useEffect(() => {
    if (jobId && taskId) { fetchData(); }
  }, [jobId, taskId]);

  // Client-side computed metrics
  const startingUnits = task?.starting_units_completed ?? 0;
  const totalUnits = task?.total_units ?? 0;
  const totalLogged = logs.reduce((sum, l) => sum + (l.units_completed ?? 0), 0);
  const totalCompleted = startingUnits + totalLogged;
  const percentComplete = totalUnits > 0
    ? Math.min(100, (totalCompleted / totalUnits) * 100)
    : 0;

  const avgPerDay = logs.length > 0 ? totalLogged / logs.length : 0;

  // logs are desc order — slice(0, 7) gives most recent 7
  const last7Logs = logs.slice(0, 7);
  const last7Units = last7Logs.reduce((sum, l) => sum + (l.units_completed ?? 0), 0);
  const last7DayAvg = last7Logs.length > 0 ? last7Units / last7Logs.length : 0;

  let estimatedFinish: string | null = null;
  const remaining = totalUnits - totalCompleted;
  if (remaining <= 0 && totalUnits > 0) {
    estimatedFinish = 'Complete';
  } else if (last7DayAvg > 0 && remaining > 0) {
    const daysNeeded = Math.ceil(remaining / last7DayAvg);
    const finish = new Date();
    finish.setDate(finish.getDate() + daysNeeded);
    estimatedFinish = finish.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  // Aggregate crew hours across all logs
  const crewMap: Record<string, { name: string; totalHours: number }> = {};
  for (const log of logs) {
    for (const ca of log.log_crew_assignments) {
      if (!ca.crew_members) continue;
      const { id, name } = ca.crew_members;
      if (!crewMap[id]) crewMap[id] = { name, totalHours: 0 };
      crewMap[id].totalHours += ca.hours_worked ?? 0;
    }
  }
  const crewSummary: CrewSummaryEntry[] = Object.entries(crewMap)
    .map(([id, v]) => ({ id, name: v.name, totalHours: v.totalHours }))
    .sort((a, b) => b.totalHours - a.totalHours);

  return {
    task,
    logs,
    loading,
    error,
    totalLogged,
    percentComplete,
    avgPerDay,
    last7DayAvg,
    estimatedFinish,
    crewSummary,
    fetchData,
  };
}
