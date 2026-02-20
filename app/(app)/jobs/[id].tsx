import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Job, DailyLog } from '../../../types';
import { Colors } from '../../../constants/Colors';

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    const [{ data: jobData }, { data: logData }] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, task_types(*), job_snapshots(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('daily_logs')
        .select('*')
        .eq('job_id', id)
        .order('log_date', { ascending: false }),
    ]);
    if (jobData) setJob(jobData);
    if (logData) setLogs(logData);
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
    Alert.alert('Delete log?', 'This will remove this day\'s entry and recalculate your ETA.', [
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

  const scheduleColor =
    snap?.days_ahead_behind == null ? Colors.textSecondary
    : snap.days_ahead_behind >= 0 ? Colors.ahead
    : Colors.behind;

  const scheduleText =
    snap?.days_ahead_behind == null ? 'No target date set'
    : snap.days_ahead_behind === 0 ? 'On track'
    : snap.days_ahead_behind > 0
      ? `${snap.days_ahead_behind} days ahead of schedule`
      : `${Math.abs(snap.days_ahead_behind)} days behind schedule`;

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

        {/* Schedule status */}
        <View style={[styles.scheduleCard, { borderColor: scheduleColor + '44' }]}>
          <Text style={[styles.scheduleText, { color: scheduleColor }]}>{scheduleText}</Text>
          {snap?.estimated_finish_date && (
            <Text style={styles.etaText}>
              Est. finish:{' '}
              <Text style={styles.etaDate}>
                {new Date(snap.estimated_finish_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </Text>
            </Text>
          )}
          {job.target_end_date && (
            <Text style={styles.targetText}>
              Target:{' '}
              {new Date(job.target_end_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          )}
        </View>

        {/* Progress */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
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

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Avg/day (all time)"
            value={snap?.avg_units_per_day?.toFixed(1) ?? '—'}
            unit={job.unit}
          />
          <StatCard
            label="Avg/day (last 7)"
            value={snap?.last_7_day_avg?.toFixed(1) ?? '—'}
            unit={job.unit}
            highlight={!!(snap?.last_7_day_avg && snap.avg_units_per_day &&
              snap.last_7_day_avg > snap.avg_units_per_day)}
          />
          <StatCard
            label="Days logged"
            value={String(snap?.total_days_logged ?? 0)}
            unit="days"
          />
          <StatCard
            label="Crew size"
            value={String(job.crew_size ?? '—')}
            unit="workers"
          />
        </View>

        {/* Equipment notes */}
        {job.equipment_notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment & Materials</Text>
            <Text style={styles.notesText}>{job.equipment_notes}</Text>
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
            <Text style={styles.noLogs}>No logs yet. Log today's work to start tracking!</Text>
          ) : (
            logs.map(log => <LogRow key={log.id} log={log} unit={job.unit} onDelete={deleteLog} />)
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, unit, highlight }: {
  label: string; value: string; unit: string; highlight?: boolean;
}) {
  return (
    <View style={scStyles.card}>
      <Text style={[scStyles.value, highlight && { color: Colors.success }]}>{value}</Text>
      <Text style={scStyles.unit}>{unit}</Text>
      <Text style={scStyles.label}>{label}</Text>
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
  unit: { fontSize: 11, color: Colors.textMuted },
  label: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 2 },
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
          {log.crew_size && <Text style={lrStyles.metaText}>{log.crew_size} crew</Text>}
          {log.hours_worked && <Text style={lrStyles.metaText}>{log.hours_worked}h worked</Text>}
          {log.weather_condition && (
            <Text style={lrStyles.metaText}>
              {log.weather_temp_f}°F · {log.weather_condition}
            </Text>
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

  scheduleCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14, padding: 16,
    gap: 6, borderWidth: 1,
  },
  scheduleText: { fontSize: 17, fontWeight: '800' },
  etaText: { fontSize: 14, color: Colors.textSecondary },
  etaDate: { color: Colors.textPrimary, fontWeight: '700' },
  targetText: { fontSize: 13, color: Colors.textMuted },

  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 5 },
  progressLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  remainingLabel: { fontSize: 13, color: Colors.textSecondary },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  notesText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 21 },

  logBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    padding: 18, alignItems: 'center',
  },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  noLogs: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', padding: 20 },
});
