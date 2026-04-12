import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { getPaceColor, getForecastSentence } from '../../../types';
import { Colors } from '../../../constants/Colors';
import JobVariables, { jobVariablesToPending } from '../../../components/JobVariables';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { webConfirm } from '../../../lib/webConfirm';
import { useJobData } from '../../../hooks/useJobData';
import { useJobEdit } from '../../../hooks/useJobEdit';
import { useTaskEdit } from '../../../hooks/useTaskEdit';
import { useTaskAdd } from '../../../hooks/useTaskAdd';
import { EditJobModal } from '../../../components/jobs/EditJobModal';
import { EditTaskModal } from '../../../components/jobs/EditTaskModal';
import { AddTaskModal } from '../../../components/jobs/AddTaskModal';
import { TaskList } from '../../../components/jobs/TaskList';
import { LogRow } from '../../../components/jobs/LogRow';

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { job, logs, tasks, setTasks, jobVars, taskVars, loading, fetchData } = useJobData(id);
  const jobEditHook = useJobEdit(id, job, fetchData);
  const taskEditHook = useTaskEdit(id, fetchData);
  const taskAddHook = useTaskAdd(id, tasks, fetchData);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  async function markComplete() {
    webConfirm('Mark this job complete? It will be archived and removed from your active list.', async () => {
      const result = await supabase.from('jobs').update({ status: 'completed' }).eq('id', id).select('id');
      console.log('[markComplete]', JSON.stringify(result));
      const { data, error } = result;
      if (error) Alert.alert('Error', error.message);
      else if (!data?.length) Alert.alert('Error', 'Permission denied — could not update job.');
      else router.replace('/(app)/jobs');
    });
  }

  async function deleteJob() {
    webConfirm('Delete job? This will permanently delete the job and all its logs. This cannot be undone.', async () => {
      const result = await supabase.from('jobs').delete().eq('id', id).select('id');
      console.log('[deleteJob]', JSON.stringify(result));
      const { data, error } = result;
      if (error) Alert.alert('Error', error.message);
      else if (!data?.length) Alert.alert('Error', 'Permission denied — could not delete job.');
      else router.replace('/(app)/jobs');
    });
  }

  async function deleteLog(logId: string) {
    Alert.alert("Delete log?", "This will remove this day's entry and recalculate your ETA.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('daily_logs').delete().eq('id', logId); fetchData(); } },
    ]);
  }

  async function toggleTaskStatus(task: import('../../../types').Task) {
    const nextStatus: import('../../../types').Task['status'] =
      task.status === 'pending' ? 'active'
      : task.status === 'active' ? 'completed'
      : 'pending';
    const { error } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id);
    if (error) Alert.alert('Error', error.message);
    else fetchData();
  }

  async function reorderTask(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= tasks.length) return;
    const reordered = [...tasks];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setTasks(reordered);
    await Promise.all(reordered.map((t, i) =>
      supabase.from('tasks').update({ sequence_order: i }).eq('id', t.id)
    ));
  }

  if (loading || !job) {
    return (
      <View style={styles.container}>
        <Text style={{ color: Colors.textMuted, padding: 40 }}>Loading…</Text>
      </View>
    );
  }

  const snap = job.job_snapshots;

  const taskProgress = logs.reduce((acc, log) => {
    if (log.task_id) acc[log.task_id] = (acc[log.task_id] ?? 0) + (log.units_completed ?? 0);
    return acc;
  }, tasks.reduce((acc, t) => {
    acc[t.id] = t.starting_units_completed ?? 0;
    return acc;
  }, {} as Record<string, number>));

  const tasksWithUnits = tasks.filter(t => (t.total_units ?? 0) > 0);
  const taskPcts = tasksWithUnits.map(t =>
    Math.min(100, ((taskProgress[t.id] ?? 0) / (t.total_units ?? 1)) * 100)
  );
  const avgTaskPct = taskPcts.length > 0
    ? taskPcts.reduce((a, b) => a + b, 0) / taskPcts.length
    : null;

  const displayCompleted = snap?.units_completed ?? job.starting_units_completed ?? 0;
  const pct = avgTaskPct != null
    ? Math.min(100, Math.round(avgTaskPct))
    : (job.total_units > 0 ? Math.min(100, Math.round((displayCompleted / job.total_units) * 100)) : 0);

  const paceColor = getPaceColor(snap?.pace_status);
  const forecastSentence = getForecastSentence(job);

  const burnRate = snap?.burn_rate;
  const burnColor = burnRate == null ? Colors.textMuted
    : burnRate > 1.1 ? Colors.danger
    : Colors.success;
  const burnLabel = burnRate == null ? '—'
    : burnRate > 1.1 ? `${((burnRate - 1) * 100).toFixed(0)}% over budget`
    : burnRate < 0.95 ? `${((1 - burnRate) * 100).toFixed(0)}% under budget`
    : 'On budget';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={jobEditHook.openEditJob} style={styles.editBtn}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteJob} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={markComplete} style={styles.completeBtn}>
            <Text style={styles.completeBtnText}>Mark complete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.jobName}>{job.name}</Text>
        {job.location_name && <Text style={styles.location}>📍 {job.location_name}</Text>}
        {job.task_types && <Text style={styles.taskType}>{job.task_types.name}</Text>}

        {/* Forecast */}
        <Card style={[{ gap: 8 }, { borderColor: paceColor + '44' }]}>
          {forecastSentence ? (
            <Text style={styles.forecastSentence}>{forecastSentence}</Text>
          ) : (
            <Text style={styles.forecastPending}>Log work to start forecasting.</Text>
          )}
          {snap?.estimated_finish_date && (
            <Text style={styles.etaDetail}>
              Est. completion:{' '}
              <Text style={{ color: paceColor, fontWeight: '700' }}>
                {new Date(snap.estimated_finish_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </Text>
            </Text>
          )}
          {job.target_end_date && (
            <Text style={styles.bidDate}>
              Bid date:{' '}
              {new Date(job.target_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          )}
        </Card>

        {/* Progress */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: paceColor }]} />
          </View>
          <Text style={styles.progressLabel}>{pct}% complete</Text>
          {tasksWithUnits.length > 0 ? (
            <Text style={styles.progressHint}>
              Avg of {tasksWithUnits.length} task{tasksWithUnits.length !== 1 ? 's' : ''} — adding new tasks reduces this %
            </Text>
          ) : job.total_units > 0 ? (
            <Text style={styles.progressHint}>{displayCompleted.toFixed(0)} of {job.total_units} {job.unit}</Text>
          ) : (
            <Text style={styles.progressHint}>Add tasks with units to track progress</Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCard label={`${job.unit}/day avg`} value={snap?.avg_units_per_day?.toFixed(1) ?? '—'} sub="all time" />
          <StatCard
            label={`${job.unit}/day avg`}
            value={snap?.last_7_day_avg?.toFixed(1) ?? '—'}
            sub="last 7 days"
            color={snap?.last_7_day_avg && snap?.avg_units_per_day && snap.last_7_day_avg > snap.avg_units_per_day ? Colors.success : undefined}
          />
          <StatCard label="Days logged" value={String(snap?.total_days_logged ?? 0)} sub={`of ${snap?.days_ahead_behind != null ? Math.abs(snap.days_ahead_behind) + ' diff' : '—'}`} />
          <StatCard label="Crew size" value={String(job.crew_size ?? '—')} sub="default" />
        </View>

        {/* Earned Value */}
        {snap?.bid_hours != null && (
          <Card style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Labor Budget Tracking</Text>
            <View style={styles.evRow}>
              <View style={styles.evItem}>
                <Text style={styles.evValue}>{snap.earned_value_pct?.toFixed(0) ?? '—'}%</Text>
                <Text style={styles.evLabel}>Work complete</Text>
              </View>
              <View style={styles.evItem}>
                <Text style={styles.evValue}>{snap.planned_value_pct?.toFixed(0) ?? '—'}%</Text>
                <Text style={styles.evLabel}>Timeline elapsed</Text>
              </View>
              <View style={styles.evItem}>
                <Text style={[styles.evValue, { color: burnColor }]}>{burnLabel}</Text>
                <Text style={styles.evLabel}>Burn rate</Text>
              </View>
            </View>
            {snap.hours_variance != null && (
              <Text style={[styles.hoursVariance, { color: snap.hours_variance >= 0 ? Colors.success : Colors.danger }]}>
                {snap.hours_variance >= 0
                  ? `${snap.hours_variance.toFixed(0)} man-hours under budget`
                  : `${Math.abs(snap.hours_variance).toFixed(0)} man-hours over budget`}
              </Text>
            )}
            {snap.forecast_hours_at_completion != null && (
              <Text style={styles.forecastHours}>
                Projected total: {snap.forecast_hours_at_completion.toFixed(0)} hrs (bid was {snap.bid_hours?.toFixed(0)} hrs)
              </Text>
            )}
            <Text style={styles.evHint}>{snap.total_hours_worked?.toFixed(0) ?? 0} man-hours logged so far</Text>
          </Card>
        )}

        {/* Tasks */}
        <TaskList
          tasks={tasks}
          taskVars={taskVars}
          taskProgress={taskProgress}
          dragIndex={dragIndex}
          dragOverIndex={dragOverIndex}
          onDragStart={(idx) => setDragIndex(idx)}
          onDragOver={(idx) => setDragOverIndex(idx)}
          onDrop={(idx) => {
            if (dragIndex !== null && dragIndex !== idx) reorderTask(dragIndex, idx);
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          onToggleStatus={toggleTaskStatus}
          onEdit={taskEditHook.openEditTask}
          onDelete={taskEditHook.deleteTask}
          onReorder={reorderTask}
          onAddTask={() => taskAddHook.setShowAddTask(true)}
        />

        {/* Job Variables */}
        {jobVars.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Variables</Text>
            <JobVariables readOnly variables={jobVariablesToPending(jobVars)} />
          </View>
        )}

        <Button
          label="+ Log Work"
          onPress={() => router.push({ pathname: '/(app)/log/new', params: { jobId: id } })}
        />

        {/* Daily Logs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Logs ({logs.length})</Text>
          {logs.length === 0 ? (
            <Text style={styles.mutedText}>No logs yet. Log today's work to start tracking!</Text>
          ) : (
            logs.map(log => <LogRow key={log.id} log={log} unit={job.unit} onDelete={deleteLog} />)
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      <EditJobModal hook={jobEditHook} />
      <EditTaskModal hook={taskEditHook} job={job} />
      <AddTaskModal hook={taskAddHook} />
    </View>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={scStyles.card}>
      <Text style={[scStyles.value, color && { color }]}>{value}</Text>
      <Text style={scStyles.label}>{label}</Text>
      {sub && <Text style={scStyles.sub}>{sub}</Text>}
    </View>
  );
}

const scStyles = StyleSheet.create({
  card: { flex: 1, minWidth: '45%', backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 2 },
  value: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  label: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  deleteBtn: { borderWidth: 1, borderColor: Colors.danger, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: 13 },
  completeBtn: { borderWidth: 1, borderColor: Colors.success, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  completeBtnText: { color: Colors.success, fontWeight: '600', fontSize: 13 },
  content: { padding: 20, gap: 16 },
  jobName: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32 },
  location: { fontSize: 14, color: Colors.textSecondary },
  taskType: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  forecastSentence: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, lineHeight: 26 },
  forecastPending: { fontSize: 15, color: Colors.textMuted, fontStyle: 'italic' },
  etaDetail: { fontSize: 14, color: Colors.textSecondary },
  bidDate: { fontSize: 13, color: Colors.textMuted },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  progressHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mutedText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  evRow: { flexDirection: 'row', justifyContent: 'space-between' },
  evItem: { alignItems: 'center', flex: 1 },
  evValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  evLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  hoursVariance: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  forecastHours: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  evHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
});
