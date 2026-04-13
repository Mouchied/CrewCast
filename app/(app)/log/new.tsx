import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { Job, Task, WeatherData, CrewMember } from '../../../types';
import { Colors } from '../../../constants/Colors';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { withRetryQuery } from '../../../lib/withRetry';
import { fetchWeather } from '../../../lib/weather';
import JobVariables, { PendingVariable, jobVariablesToPending } from '../../../components/JobVariables';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Card } from '../../../components/Card';
import { showToast } from '../../../lib/toast';

type TaskEntry = {
  localId: string;
  taskId: string | null;
  unitsCompleted: string;
  crewIds: Set<string>;
  hoursWorked: string;
};

function makeEntry(): TaskEntry {
  return {
    localId: Math.random().toString(36).slice(2),
    taskId: null,
    unitsCompleted: '',
    crewIds: new Set(),
    hoursWorked: '',
  };
}

function NewLogScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { profile } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);

  const [taskEntries, setTaskEntries] = useState<TaskEntry[]>([makeEntry()]);
  const [percentComplete, setPercentComplete] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [logVariables, setLogVariables] = useState<PendingVariable[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (jobId && profile?.company_id) fetchJob();
  }, [jobId, profile?.company_id]);

  useEffect(() => {
    autoCapture();
  }, []);

  async function fetchJob() {
    setFetchError(null);
    const [jobResult, taskResult, varResult, memberResult] = await Promise.all([
      withRetryQuery(async () =>
        await supabase.from('jobs').select('*, task_types(*), job_snapshots(*)').eq('id', jobId).single()
      ),
      withRetryQuery(async () =>
        await supabase.from('tasks').select('*').eq('job_id', jobId).neq('status', 'completed').order('sequence_order')
      ),
      withRetryQuery(async () =>
        await supabase.from('job_variables').select('*, job_variable_types(*)').eq('job_id', jobId).order('created_at')
      ),
      withRetryQuery(async () =>
        await supabase.from('crew_members').select('*').eq('company_id', profile?.company_id).eq('active', true).order('name')
      ),
    ]);

    const errors = [jobResult.error, taskResult.error, varResult.error, memberResult.error].filter(Boolean);
    if (errors.length) {
      setFetchError(errors[0]!);
      return;
    }

    if (jobResult.data) setJob(jobResult.data);
    if (taskResult.data) setTasks(taskResult.data);
    if (varResult.data) setLogVariables(jobVariablesToPending(varResult.data));
    if (memberResult.data) setCrewMembers(memberResult.data);
  }

  async function autoCapture() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocating(false); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setLatitude(lat);
      setLongitude(lng);

      const w = await fetchWeather(lat, lng);
      if (w) setWeather(w);
    } catch {
      // Silent fail — weather/location is enhancement, not blocker
    }
    setLocating(false);
  }

  // ── Task entry helpers ──────────────────────────────────────

  function updateEntry(localId: string, patch: Partial<Omit<TaskEntry, 'localId'>>) {
    setTaskEntries(prev =>
      prev.map(e => e.localId === localId ? { ...e, ...patch } : e)
    );
  }

  function toggleCrewForEntry(localId: string, memberId: string) {
    setTaskEntries(prev =>
      prev.map(e => {
        if (e.localId !== localId) return e;
        const next = new Set(e.crewIds);
        if (next.has(memberId)) next.delete(memberId);
        else next.add(memberId);
        return { ...e, crewIds: next };
      })
    );
  }

  function addEntry() {
    setTaskEntries(prev => [...prev, makeEntry()]);
  }

  function removeEntry(localId: string) {
    setTaskEntries(prev => prev.filter(e => e.localId !== localId));
  }

  function clearEntryError(localId: string) {
    setEntryErrors(prev => {
      if (!prev[localId]) return prev;
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  }

  // ── Save ────────────────────────────────────────────────────

  async function handleSubmit() {
    const errors: Record<string, string> = {};
    for (const entry of taskEntries) {
      if (!entry.unitsCompleted || isNaN(Number(entry.unitsCompleted))) {
        const label = entry.taskId
          ? (tasks.find(t => t.id === entry.taskId)?.name ?? 'task')
          : 'general work';
        errors[entry.localId] = `Missing: items completed for "${label}"`;
      }
    }
    if (Object.keys(errors).length > 0) {
      setEntryErrors(errors);
      return;
    }
    setEntryErrors({});
    setSubmitting(true);

    // Total crew = union across all entries
    const allCrewIds = new Set(taskEntries.flatMap(e => [...e.crewIds]));
    const totalCrewSize = allCrewIds.size || null;

    for (let i = 0; i < taskEntries.length; i++) {
      const entry = taskEntries[i];

      const { data: newLog, error } = await supabase
        .from('daily_logs')
        .insert({
          job_id: jobId,
          logged_by: profile?.id,
          log_date: logDate,
          units_completed: Number(entry.unitsCompleted),
          task_id: entry.taskId ?? null,
          percent_complete: i === 0 && percentComplete ? Number(percentComplete) : null,
          crew_size: totalCrewSize,
          hours_worked: entry.hoursWorked ? Number(entry.hoursWorked) : null,
          weather_temp_f: weather?.temp_f ?? null,
          weather_condition: weather?.condition ?? null,
          weather_wind_mph: weather?.wind_mph ?? null,
          weather_humidity: weather?.humidity ?? null,
          weather_precip_in: weather?.precip_in ?? null,
          log_latitude: latitude ?? null,
          log_longitude: longitude ?? null,
          notes: i === 0 ? (notes || null) : null,
        })
        .select()
        .single();

      if (error) {
        setSubmitting(false);
        if (error.code === '23505') {
          const taskName = entry.taskId
            ? (tasks.find(t => t.id === entry.taskId)?.name ?? 'that task')
            : 'General';
          showToast('error', `"${taskName}" already has a log for this date. Remove it first to re-log.`);
        } else {
          showToast('error', error.message);
        }
        return;
      }

      if (newLog) {
        // Save variable overrides on the first entry only
        if (i === 0 && logVariables.length > 0) {
          const { error: varErr } = await supabase.from('log_variable_overrides').insert(
            logVariables.map(v => ({
              daily_log_id: newLog.id,
              variable_type_id: v.variable_type_id,
              value: v.value,
            }))
          );
          if (varErr) console.warn('Variable override error:', varErr.message);
        }

        // Save crew assignments for this entry's crew
        if (entry.crewIds.size > 0) {
          const { error: crewErr } = await supabase.from('log_crew_assignments').insert(
            Array.from(entry.crewIds).map(memberId => ({
              daily_log_id: newLog.id,
              crew_member_id: memberId,
            }))
          );
          if (crewErr) console.warn('Crew assignment error:', crewErr.message);
        }
      }
    }

    setSubmitting(false);
    router.back();
  }

  const snap = job?.job_snapshots;
  const pct = snap && job?.total_units
    ? Math.min(100, Math.round((snap.units_completed / job.total_units) * 100))
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Log Work</Text>
      </View>

      {fetchError && (
        <View style={styles.fetchErrorBanner}>
          <Text style={styles.fetchErrorText}>Failed to load job data: {fetchError}</Text>
          <TouchableOpacity onPress={fetchJob}>
            <Text style={styles.fetchErrorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>

        {/* Job context */}
        {job && (
          <Card style={{ gap: 8 }}>
            <Text style={styles.jobName}>{job.name}</Text>
            {job.location_name ? (
              <Text style={styles.jobLocation}>{job.location_name}</Text>
            ) : null}
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={styles.progressText}>
              {snap?.units_completed?.toFixed(0) ?? 0} / {job.total_units} {job.unit} complete
            </Text>
          </Card>
        )}

        {/* Date */}
        <Input
          label="Date *"
          value={logDate}
          onChangeText={setLogDate}
          placeholder="YYYY-MM-DD"
        />

        {/* Weather */}
        <Card style={styles.weatherCard}>
          <Text style={styles.weatherTitle}>Weather & Location</Text>
          {locating ? (
            <View style={styles.weatherRow}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.weatherCapturing}>Capturing location & weather…</Text>
            </View>
          ) : weather ? (
            <View style={styles.weatherGrid}>
              <WeatherStat label="Temp" value={`${weather.temp_f}°F`} />
              <WeatherStat label="Condition" value={weather.condition} />
              <WeatherStat label="Wind" value={`${weather.wind_mph} mph`} />
              <WeatherStat label="Humidity" value={`${weather.humidity}%`} />
              {weather.precip_in > 0 && (
                <WeatherStat label="Precip" value={`${weather.precip_in}"`} />
              )}
            </View>
          ) : (
            <View style={styles.weatherRow}>
              <Text style={styles.weatherMissed}>Could not capture automatically.</Text>
              <TouchableOpacity onPress={autoCapture} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {latitude && (
            <Text style={styles.coordsText}>
              📍 {latitude.toFixed(4)}, {longitude?.toFixed(4)}
            </Text>
          )}
        </Card>

        {/* Job conditions */}
        <Text style={styles.sectionLabel}>TODAY'S CONDITIONS</Text>
        <Text style={styles.hint}>
          Pre-filled from job defaults. Change any that are different today.
        </Text>
        <JobVariables
          tradeCategory={job?.task_types?.category ?? undefined}
          variables={logVariables}
          onChange={setLogVariables}
        />

        {/* ── Task entries ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>WORK LOGGED TODAY</Text>
        <Text style={styles.hint}>
          Add one entry per task or phase worked. Assign the crew for each.
        </Text>

        {taskEntries.map((entry, index) => (
          <TaskEntryCard
            key={entry.localId}
            entry={entry}
            index={index}
            tasks={tasks}
            crewMembers={crewMembers}
            job={job}
            snap={snap}
            canRemove={taskEntries.length > 1}
            error={entryErrors[entry.localId] ?? ''}
            onUpdateEntry={(patch) => updateEntry(entry.localId, patch)}
            onToggleCrew={(memberId) => toggleCrewForEntry(entry.localId, memberId)}
            onRemove={() => removeEntry(entry.localId)}
            onClearError={() => clearEntryError(entry.localId)}
          />
        ))}

        <TouchableOpacity style={styles.addTaskBtn} onPress={addEntry}>
          <Text style={styles.addTaskText}>+ Add another task</Text>
        </TouchableOpacity>

        {/* ── Shared details ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>DETAILS</Text>

        <Input
          label="Foreman's % complete estimate (optional)"
          value={percentComplete}
          onChangeText={setPercentComplete}
          placeholder="e.g. 45  (gut feel on overall job progress)"
          keyboardType="numeric"
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything notable? Delays, conditions, equipment issues…"
          multiline
          numberOfLines={3}
          style={styles.textarea}
        />

        <Button
          label="Save Log"
          onPress={handleSubmit}
          loading={submitting}
          style={{ marginTop: 16 }}
        />

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── TaskEntryCard ───────────────────────────────────────────────

type TaskEntryCardProps = {
  entry: TaskEntry;
  index: number;
  tasks: Task[];
  crewMembers: CrewMember[];
  job: Job | null;
  snap: any;
  canRemove: boolean;
  error: string;
  onUpdateEntry: (patch: Partial<Omit<TaskEntry, 'localId'>>) => void;
  onToggleCrew: (memberId: string) => void;
  onRemove: () => void;
  onClearError: () => void;
};

function TaskEntryCard({
  entry, index, tasks, crewMembers, job, snap,
  canRemove, error, onUpdateEntry, onToggleCrew, onRemove, onClearError,
}: TaskEntryCardProps) {
  const activeTask = tasks.find(t => t.id === entry.taskId);
  const unitLabel = activeTask?.unit
    ? `${activeTask.unit.charAt(0).toUpperCase() + activeTask.unit.slice(1)} completed *`
    : job
    ? `${job.unit.charAt(0).toUpperCase() + job.unit.slice(1)} completed *`
    : 'Items completed *';

  return (
    <Card style={{ gap: 10 }}>
      <View style={cardStyles.cardHeader}>
        <Text style={cardStyles.cardTitle}>Task {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} style={cardStyles.removeBtn}>
            <Text style={cardStyles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Task selector */}
      {tasks.length > 0 && (
        <>
          <Text style={cardStyles.label}>Task worked on</Text>
          {tasks.some(t => t.total_units != null) && !entry.taskId && (
            <Text style={cardStyles.taskWarning}>
              Select a task so units count toward job progress.
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cardStyles.chipScroll}>
            {[{ id: null, name: 'General / whole job' } as any, ...tasks].map(t => (
              <TouchableOpacity
                key={t.id ?? 'general'}
                style={[
                  cardStyles.taskChip,
                  entry.taskId === t.id && cardStyles.taskChipSelected,
                ]}
                onPress={() => onUpdateEntry({ taskId: t.id })}
              >
                <Text style={[
                  cardStyles.taskChipText,
                  entry.taskId === t.id && cardStyles.taskChipTextSelected,
                ]}>
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Units completed */}
      {activeTask?.total_units != null && (
        <Text style={cardStyles.hint}>
          {activeTask.name} — {activeTask.total_units} total {activeTask.unit || 'items'} for this task
        </Text>
      )}
      <Input
        label={unitLabel}
        value={entry.unitsCompleted}
        onChangeText={val => { onUpdateEntry({ unitsCompleted: val }); onClearError(); }}
        placeholder={`e.g. ${snap?.avg_units_per_day?.toFixed(0) ?? '12'}`}
        keyboardType="numeric"
        error={error || undefined}
      />

      {/* Crew for this task */}
      <Text style={cardStyles.label}>Crew on this task</Text>
      {crewMembers.length === 0 ? (
        <Text style={cardStyles.noCrewText}>
          No crew members added yet. Add them in Settings → Crew.
        </Text>
      ) : (
        <View style={cardStyles.crewGrid}>
          {crewMembers.map(member => {
            const selected = entry.crewIds.has(member.id);
            return (
              <TouchableOpacity
                key={member.id}
                style={[cardStyles.crewChip, selected && cardStyles.crewChipSelected]}
                onPress={() => onToggleCrew(member.id)}
                activeOpacity={0.7}
              >
                <Text style={[cardStyles.crewInitial, selected && cardStyles.crewInitialSelected]}>
                  {member.name.charAt(0).toUpperCase()}
                </Text>
                <Text style={[cardStyles.crewName, selected && cardStyles.crewNameSelected]}>
                  {member.name}
                </Text>
                {member.trade ? (
                  <Text style={[cardStyles.crewTrade, selected && cardStyles.crewTradeSelected]}>
                    {member.trade}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {entry.crewIds.size > 0 && (
        <Text style={cardStyles.crewCount}>
          {entry.crewIds.size} crew member{entry.crewIds.size !== 1 ? 's' : ''} on this task
        </Text>
      )}

      {/* Hours for this task */}
      <Input
        label="Hours worked on this task"
        value={entry.hoursWorked}
        onChangeText={val => onUpdateEntry({ hoursWorked: val })}
        placeholder="e.g. 32  (4 crew × 8 hrs)"
        keyboardType="numeric"
      />
    </Card>
  );
}

function WeatherStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={wStyles.stat}>
      <Text style={wStyles.value}>{value}</Text>
      <Text style={wStyles.label}>{label}</Text>
    </View>
  );
}

const wStyles = StyleSheet.create({
  stat: { alignItems: 'center', minWidth: 70 },
  value: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  label: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});

const cardStyles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  removeBtn: { padding: 4 },
  removeText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: -4 },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: -2, lineHeight: 18 },
  taskWarning: { color: '#f59e0b', fontSize: 12, lineHeight: 18 },
  chipScroll: { flexGrow: 0 },
  taskChip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border,
    marginRight: 8,
  },
  taskChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  taskChipText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  taskChipTextSelected: { color: '#fff' },
  noCrewText: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  crewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  crewChip: {
    alignItems: 'center', gap: 4, padding: 12, borderRadius: 14,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.border,
    minWidth: 80,
  },
  crewChipSelected: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary },
  crewInitial: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgCard, textAlign: 'center', lineHeight: 40,
    fontSize: 18, fontWeight: '800', color: Colors.textSecondary,
  },
  crewInitialSelected: { backgroundColor: Colors.primary, color: '#fff' },
  crewName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  crewNameSelected: { color: Colors.primary },
  crewTrade: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  crewTradeSelected: { color: Colors.primary + 'aa' },
  crewCount: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: -4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 24, paddingTop: 60,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  backBtn: { padding: 4 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  form: { padding: 20, gap: 10 },

  jobName: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  jobLocation: { fontSize: 13, color: Colors.textSecondary },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  progressText: { fontSize: 12, color: Colors.textMuted },

  weatherCard: {
    gap: 10,
  },
  weatherTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherCapturing: { color: Colors.textMuted, fontSize: 13 },
  weatherMissed: { color: Colors.textMuted, fontSize: 13, flex: 1 },
  retryBtn: { padding: 8 },
  retryText: { color: Colors.primary, fontWeight: '600' },
  weatherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  coordsText: { fontSize: 11, color: Colors.textMuted },

  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginTop: 8, marginBottom: -2,
  },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: -4 },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: -2, lineHeight: 18 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },

  addTaskBtn: {
    borderRadius: 12, padding: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
  },
  addTaskText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

  fetchErrorBanner: {
    backgroundColor: Colors.danger + '22', borderRadius: 12,
    margin: 16, marginBottom: 0, padding: 16,
    borderWidth: 1, borderColor: Colors.danger + '44', gap: 8,
  },
  fetchErrorText: { color: Colors.danger, fontSize: 14 },
  fetchErrorRetry: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
});

export default function NewLogScreenWithBoundary() {
  return (
    <ErrorBoundary fallbackTitle="Log form failed to load">
      <NewLogScreen />
    </ErrorBoundary>
  );
}
