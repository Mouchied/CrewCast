import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Job, DailyLog, Task, JobVariable, TaskVariable } from '../types';

export function useJobData(id: string | undefined) {
  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobVars, setJobVars] = useState<JobVariable[]>([]);
  const [taskVars, setTaskVars] = useState<Record<string, TaskVariable[]>>({});
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    if (!id) return;
    const [{ data: jobData }, { data: logData }, { data: taskData }, { data: varData }] =
      await Promise.all([
        supabase
          .from('jobs')
          .select('*, task_types(*), job_snapshots(*)')
          .eq('id', id)
          .single(),
        supabase
          .from('daily_logs')
          .select('*, tasks(id, name)')
          .eq('job_id', id)
          .order('log_date', { ascending: false }),
        supabase
          .from('tasks')
          .select('*, task_variables(*, job_variable_types(*))')
          .eq('job_id', id)
          .order('sequence_order'),
        supabase
          .from('job_variables')
          .select('*, job_variable_types(*)')
          .eq('job_id', id)
          .order('created_at'),
      ]);
    if (jobData) setJob(jobData);
    if (logData) setLogs(logData);
    if (taskData) {
      setTasks(taskData);
      const grouped = (taskData as (Task & { task_variables?: TaskVariable[] })[]).reduce(
        (acc, t) => {
          if (t.task_variables?.length) acc[t.id] = t.task_variables;
          return acc;
        },
        {} as Record<string, TaskVariable[]>
      );
      setTaskVars(grouped);
    }
    if (varData) setJobVars(varData);
    setLoading(false);
  }

  useEffect(() => { if (id) fetchData(); }, [id]);

  return { job, logs, tasks, setTasks, jobVars, taskVars, loading, fetchData };
}
