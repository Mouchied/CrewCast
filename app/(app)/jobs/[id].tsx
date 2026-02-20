import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Job, DailyLog, Task, getPaceColor, getForecastSentence } from '../../../types';
import { Colors } from '../../../constants/Colors';

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    const [{ data: jobData }, { data: logData }, { data: taskData }] = await Promise.all([
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
        .select('*')
        .eq('job_id', id)
        .order('sequence_order'),
    ]);
    if (jobData) setJob(jobData);
    if (logData) setLogs(logData);
    if (taskData) setTasks(taskData);
    setLoading(false);
  }

  async function markComplete() {
    Alert.alert(
      'Mark job complete?',
      'This will archive the job and remove it from your active list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('jobs').update({ status: 'completed' }).eq('id', id);
            router.replace('/(app)');
          },
        },
      ]
    );
  }

  async function deleteLog(logId: string) {
    Alert.alert("Delete log?", "This will remove this day's entry and recalculate your ETA.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('daily_logs').delete().eq('id', logId);
          fetchData();
        },
      },
    ]);
  }

  async function addTask() {
    if (!newTaskName.trim()) return;
    const { error } = await supabase.from('tasks').insert({
      job_id: id,
      name: newTaskName.trim(),
      estimated_hours: newTaskHours ? Number(newTaskHours) : null,
      sequence_order: tasks.length,
    });
    if (!error) {
      setNewTaskName('');
      setNewTaskHours('');
      setShowAddTask(false);
      fetchData();
    }
  }

  async function toggleTaskStatus(task: Task) {
    const nextStatus: Task['status'] =
      task.status === 'pending' ? 'active'
      : task.status === 'active' ? 'completed'
      : 'pending';
    await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id);
    fetchData();
  }

  if (loading || !job) {
    return (
      <View style={styles.container}>
        <Text style={{ color: Colors.textMuted, padding: 40 }}>Loading…</Text>
      </View>
    );
  }

  const snap = job.job_snapshots;
  const pct = snap && job.total_units > 0
    ? Math.min(100, Math.round((snap.units_completed / job.total_units) * 100))
    : 0;

  const paceColor = getPaceColor(snap?.pace_status);
  const forecastSentence = getForecastSentence(job);

  // Burn rate display
  const burnRate = snap?.burn_rate;
  const burnColor = burnRate == null ? Colors.textMuted
    : burnRate > 1.1 ? Colors.danger
    : burnRate < 0.95 ? Colors.success
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
        <TouchableOpacity onPress={markComplete} style={styles.completeBtn}>
          <Text style={styles.completeBtnText}>Mark complete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Job header */}
        <Text style={styles.jobName}>{job.name}</Text>
        {job.location_name && (
          <Text style={styles.location}>📍 {job.location_name}</Text>
        )}
        {job.task_types && (
          <Text style={styles.taskType}>{job.task_types.name}</Text>
        )}

        {/* ── FORECAST CARD — the core value prop ── */}
        <View style={[styles.forecastCard, { borderColor: paceColor + '44' }]}>
          {forecastSentence ? (
            <Text style={styles.forecastSentence}>{forecastSentence}</Text>
          ) : (
            <Text style={styles.forecastPending}>
              Log work to start forecasting.
            </Text>
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
              {new Date(job.target_end_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          )}
        </View>

        {/* ── PROGRESS ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: paceColor }]} />
          </View>
          <Text style={styles.progressLabel}>
            {snap?.units_completed?.toFixed(0) ?? 0} of {job.total_units} {job.unit} — {pct}% complete
          </Text>
          {snap?.units_remaining != null && (
            <Text style={styles.remainingLabel}>
              {snap.units_remaining.toFixed(0)} {job.unit} remaining
            </Text>
          )}
        </View>

        {/* ── STATS GRID ── */}
        <View style={styles.statsGrid}>
          <StatCard
            label={`${job.unit}/day avg`}
            value={snap?.avg_units_per_day?.toFixed(1) ?? '—'}
            sub="all time"
          />
          <StatCard
            label={`${job.unit}/day avg`}
            value={snap?.last_7_day_avg?.toFixed(1) ?? '—'}
            sub="last 7 days"
            color={
              snap?.last_7_day_avg && snap?.avg_units_per_day &&
              snap.last_7_day_avg > snap.avg_units_per_day
                ? Colors.success : undefined
            }
          />
          <StatCard
            label="Days logged"
            value={String(snap?.total_days_logged ?? 0)}
            sub={`of ${snap?.days_ahead_behind != null ? Math.abs(snap.days_ahead_behind) + ' diff' : '—'}`}
          />
          <StatCard
            label="Crew size"
            value={String(job.crew_size ?? '—')}
            sub="default"
          />
        </View>

        {/* ── EARNED VALUE / BURN RATE (only if bid_hours entered) ── */}
        {snap?.bid_hours != null && (
          <View style={styles.evCard}>
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
                  : `${Math.abs(snap.hours_variance).toFixed(0)} man-hours over budget`
                }
              </Text>
            )}
            {snap.forecast_hours_at_completion != null && (
              <Text style={styles.forecastHours}>
                Projected total: {snap.forecast_hours_at_completion.toFixed(0)} hrs
                {' '}(bid was {snap.bid_hours?.toFixed(0)} hrs)
              </Text>
            )}
            <Text style={styles.evHint}>
              {snap.total_hours_worked?.toFixed(0) ?? 0} man-hours logged so far
            </Text>
          </View>
        )}

        {/* ── TASKS ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tasks ({tasks.length})</Text>
            <TouchableOpacity onPress={() => setShowAddTask(true)}>
              <Text style={styles.sectionAction}>+ Add task</Text>
            </TouchableOpacity>
          </View>
          {tasks.length === 0 ? (
            <Text style={styles.mutedText}>
              Break the job into tasks to track progress per phase.
            </Text>
          ) : (
            tasks.map(task => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskRow}
                onPress={() => toggleTaskStatus(task)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.taskDot,
                  task.status === 'completed' && { backgroundColor: Colors.success },
                  task.status === 'active' && { backgroundColor: Colors.warning },
                ]} />
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.taskName,
                    task.status === 'completed' && { textDecorationLine: 'line-through', color: Colors.textMuted },
                  ]}>
                    {task.name}
                  </Text>
                  {task.estimated_hours != null && (
                    <Text style={styles.taskMeta}>{task.estimated_hours} hrs estimated</Text>
                  )}
                </View>
                <Text style={[
                  styles.taskStatus,
                  task.status === 'completed' && { color: Colors.success },
                  task.status === 'active' && { color: Colors.warning },
                ]}>
                  {task.status}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Equipment notes */}
        {job.equipment_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment & Materials</Text>
            <Text style={styles.mutedText}>{job.equipment_notes}</Text>
          </View>
        )}

        {/* Log daily button */}
        <TouchableOpacity
          style={styles.logBtn}
          onPress={() => router.push({ pathname: '/(app)/log/new', params: { jobId: id } })}
        >
          <Text style={styles.logBtnText}>+ Log Today's Work</Text>
        </TouchableOpacity>

        {/* Daily log history */}
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

      {/* Add Task Modal */}
      <Modal
        visible={showAddTask}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTask(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Add Task</Text>
            <TextInput
              style={styles.modalInput}
              value={newTaskName}
              onChangeText={setNewTaskName}
              placeholder="Task name (e.g. Racking install)"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              value={newTaskHours}
              onChangeText={setNewTaskHours}
              placeholder="Estimated man-hours (optional)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowAddTask(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={addTask}>
                <Text style={styles.modalSaveText}>Add Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={scStyles.card}>
      <Text style={[scStyles.value, color && { color }]}>{value}</Text>
      <Text style={scStyles.label}>{label}</Text>
      {sub && <Text style={scStyles.sub}>{sub}</Text>}
    </View>
  );
}

const scStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.bgCard,
    borderRadius: 12, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, gap: 2,
  },
  value: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  label: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
});

function LogRow({ log, unit, onDelete }: {
  log: DailyLog; unit: string; onDelete: (id: string) => void;
}) {
  return (
    <View style={lrStyles.row}>
      <View style={lrStyles.left}>
        <Text style={lrStyles.date}>
          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        </Text>
        <View style={lrStyles.meta}>
          {log.tasks?.name && <Text style={lrStyles.taskTag}>{log.tasks.name}</Text>}
          {log.crew_size != null && <Text style={lrStyles.metaText}>{log.crew_size} crew</Text>}
          {log.hours_worked != null && <Text style={lrStyles.metaText}>{log.hours_worked}h</Text>}
          {log.weather_condition && (
            <Text style={lrStyles.metaText}>
              {log.weather_temp_f}°F · {log.weather_condition}
            </Text>
          )}
          {log.percent_complete != null && (
            <Text style={lrStyles.metaText}>{log.percent_complete}% done</Text>
          )}
        </View>
        {log.notes ? <Text style={lrStyles.notes} numberOfLines={1}>{log.notes}</Text> : null}
      </View>
      <View style={lrStyles.right}>
        <Text style={lrStyles.units}>{log.units_completed}</Text>
        <Text style={lrStyles.unitLabel}>{unit}</Text>
        <TouchableOpacity onPress={() => onDelete(log.id)} style={lrStyles.delBtn}>
          <Text style={lrStyles.delText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const lrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  left: { flex: 1, gap: 4, paddingRight: 12 },
  date: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskTag: {
    fontSize: 11, color: Colors.primary, fontWeight: '600',
    backgroundColor: Colors.primary + '22', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4,
  },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  notes: { fontSize: 12, color: Colors.textMuted },
  right: { alignItems: 'center', gap: 2, minWidth: 60 },
  units: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  unitLabel: { fontSize: 11, color: Colors.textMuted },
  delBtn: { marginTop: 4, padding: 4 },
  delText: { color: Colors.textMuted, fontSize: 12 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 24, paddingTop: 60,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  completeBtn: {
    borderWidth: 1, borderColor: Colors.success, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  completeBtnText: { color: Colors.success, fontWeight: '600', fontSize: 13 },
  content: { padding: 20, gap: 16 },
  jobName: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32 },
  location: { fontSize: 14, color: Colors.textSecondary },
  taskType: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  forecastCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 18, gap: 8, borderWidth: 1,
  },
  forecastSentence: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, lineHeight: 26 },
  forecastPending: { fontSize: 15, color: Colors.textMuted, fontStyle: 'italic' },
  etaDetail: { fontSize: 14, color: Colors.textSecondary },
  bidDate: { fontSize: 13, color: Colors.textMuted },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  sectionAction: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  remainingLabel: { fontSize: 13, color: Colors.textSecondary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mutedText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },

  evCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border,
  },
  evRow: { flexDirection: 'row', justifyContent: 'space-between' },
  evItem: { alignItems: 'center', flex: 1 },
  evValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  evLabel: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  hoursVariance: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  forecastHours: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  evHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  taskDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.border, borderWidth: 1, borderColor: Colors.borderLight,
  },
  taskName: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
  taskMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  taskStatus: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },

  logBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    padding: 18, alignItems: 'center',
  },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalInput: {
    backgroundColor: Colors.bgInput, borderRadius: 12, padding: 16,
    color: Colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Colors.border,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, borderRadius: 12, padding: 16, alignItems: 'center',
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '700' },
  modalSave: {
    flex: 1, borderRadius: 12, padding: 16, alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});
