import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { Job, Task, WeatherData, CrewMember } from '../../../types';
import { Colors } from '../../../constants/Colors';
import { fetchWeather, fetchHistoricalWeather } from '../../../lib/weather';
import JobVariables, { PendingVariable, jobVariablesToPending } from '../../../components/JobVariables';

export default function NewLogScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { profile } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set());
  const [percentComplete, setPercentComplete] = useState('');
  const [unitsCompleted, setUnitsCompleted] = useState('');
  const [crewSize, setCrewSize] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  // Variables for this log — starts pre-populated from job defaults
  const [logVariables, setLogVariables] = useState<PendingVariable[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (jobId) fetchJob();
    captureLocation();
  }, [jobId]);

  // Re-fetch weather whenever date or location changes
  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      fetchWeatherForDate(latitude, longitude, logDate);
    }
  }, [latitude, longitude, logDate]);

  async function fetchJob() {
    const [{ data: jobData }, { data: taskData }, { data: varData }, { data: memberData }] =
      await Promise.all([
        supabase
          .from('jobs')
          .select('*, task_types(*), job_snapshots(*)')
          .eq('id', jobId)
          .single(),
        supabase
          .from('tasks')
          .select('*')
          .eq('job_id', jobId)
          .neq('status', 'completed')
          .order('sequence_order'),
        supabase
          .from('job_variables')
          .select('*, job_variable_types(*)')
          .eq('job_id', jobId)
          .order('created_at'),
        supabase
          .from('crew_members')
          .select('*')
          .eq('company_id', profile?.company_id)
          .eq('active', true)
          .order('name'),
      ]);

    if (jobData) {
      setJob(jobData);
      if (jobData.crew_size) setCrewSize(String(jobData.crew_size));
    }
    if (taskData) setTasks(taskData);
    // Pre-populate log variables from job defaults
    if (varData) setLogVariables(jobVariablesToPending(varData));
    if (memberData) setCrewMembers(memberData);
  }

  async function captureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocating(false); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setLatitude(lat);
      setLongitude(lng);
      // weather fetch is triggered by the useEffect on [latitude, longitude, logDate]
    } catch {
      // Silent fail — weather/location is enhancement, not blocker
    }
    setLocating(false);
  }

  async function fetchWeatherForDate(lat: number, lng: number, date: string) {
    setLocating(true);
    const today = new Date().toISOString().split('T')[0];
    const w = date === today
      ? await fetchWeather(lat, lng)
      : await fetchHistoricalWeather(lat, lng, date);
    if (w) setWeather(w);
    setLocating(false);
  }

  function toggleCrew(id: string) {
    setSelectedCrewIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Keep crew size in sync with selected count
      setCrewSize(String(next.size || (job?.crew_size ?? '')));
      return next;
    });
  }

  async function handleSubmit() {
    if (!unitsCompleted || isNaN(Number(unitsCompleted))) {
      Alert.alert('Missing field', 'Enter how many units were completed today.');
      return;
    }

    setSubmitting(true);

    // 1. Insert the daily log
    const { data: newLog, error } = await supabase
      .from('daily_logs')
      .insert({
        job_id: jobId,
        logged_by: profile?.id,
        log_date: logDate,
        units_completed: Number(unitsCompleted),
        task_id: selectedTaskId ?? null,
        percent_complete: percentComplete ? Number(percentComplete) : null,
        crew_size: crewSize ? Number(crewSize) : null,
        hours_worked: hoursWorked ? Number(hoursWorked) : null,
        weather_temp_f: weather?.temp_f ?? null,
        weather_condition: weather?.condition ?? null,
        weather_wind_mph: weather?.wind_mph ?? null,
        weather_humidity: weather?.humidity ?? null,
        weather_precip_in: weather?.precip_in ?? null,
        log_latitude: latitude ?? null,
        log_longitude: longitude ?? null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      if (error.code === '23505') {
        Alert.alert('Already logged', 'A log for this date already exists. Delete it first to re-log.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }

    if (newLog) {
      // 2. Save variable overrides (all current log values — even if same as job default)
      if (logVariables.length > 0) {
        await supabase.from('log_variable_overrides').insert(
          logVariables.map(v => ({
            daily_log_id: newLog.id,
            variable_type_id: v.variable_type_id,
            value: v.value,
          }))
        );
      }

      // 3. Save crew assignments
      if (selectedCrewIds.size > 0) {
        await supabase.from('log_crew_assignments').insert(
          Array.from(selectedCrewIds).map(memberId => ({
            daily_log_id: newLog.id,
            crew_member_id: memberId,
          }))
        );
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

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        {/* Job context */}
        {job && (
          <View style={styles.jobContext}>
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
          </View>
        )}

        {/* Weather auto-capture */}
        <View style={styles.weatherCard}>
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
              <TouchableOpacity onPress={captureLocation} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
          {latitude && (
            <Text style={styles.coordsText}>
              📍 {latitude.toFixed(4)}, {longitude?.toFixed(4)}
            </Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>LOG ENTRY</Text>

        {/* Task selection */}
        {tasks.length > 0 && (
          <>
            <Text style={styles.label}>Task worked on today</Text>
            {tasks.some(t => t.total_units != null) && !selectedTaskId && (
              <Text style={styles.taskWarning}>
                This job tracks progress by task. Select a task so your units count toward job progress.
              </Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[{ id: null, name: 'General / whole job' } as any, ...tasks].map(t => (
                <TouchableOpacity
                  key={t.id ?? 'general'}
                  style={[
                    styles.taskChip,
                    selectedTaskId === t.id && styles.taskChipSelected,
                  ]}
                  onPress={() => setSelectedTaskId(t.id)}
                >
                  <Text style={[
                    styles.taskChipText,
                    selectedTaskId === t.id && styles.taskChipTextSelected,
                  ]}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>Date *</Text>
        <TextInput
          style={styles.input}
          value={logDate}
          onChangeText={setLogDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textMuted}
        />

        {(() => {
          const activeTask = tasks.find(t => t.id === selectedTaskId);
          const unitLabel = activeTask?.unit
            ? `${activeTask.unit.charAt(0).toUpperCase() + activeTask.unit.slice(1)} completed today *`
            : job
            ? `${job.unit.charAt(0).toUpperCase() + job.unit.slice(1)} completed today *`
            : 'Units completed *';
          const taskRemaining = activeTask?.total_units != null
            ? ` (${activeTask.total_units} total for this task)`
            : '';
          return (
            <>
              <Text style={styles.label}>{unitLabel}</Text>
              {taskRemaining ? (
                <Text style={styles.hint}>{activeTask?.name}{taskRemaining}</Text>
              ) : null}
              <TextInput
                style={styles.input}
                value={unitsCompleted}
                onChangeText={setUnitsCompleted}
                placeholder={`e.g. ${snap?.avg_units_per_day?.toFixed(0) ?? '12'}`}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            </>
          );
        })()}

        {snap?.avg_units_per_day ? (
          <Text style={styles.hint}>
            Your average is {snap.avg_units_per_day.toFixed(1)} {job?.unit}/day
          </Text>
        ) : null}

        {/* ── JOB CONDITIONS TODAY ───────────────────── */}
        {/* Pre-filled from job defaults — change if conditions differ today */}
        <Text style={styles.sectionLabel}>TODAY'S CONDITIONS</Text>
        <Text style={styles.hint}>
          Pre-filled from job defaults. Change any that are different today
          — row length, pile length, wire gauge, etc. This data powers your
          benchmarks automatically.
        </Text>

        <JobVariables
          tradeCategory={job?.task_types?.category ?? undefined}
          variables={logVariables}
          onChange={setLogVariables}
        />

        {/* ── CREW ────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>CREW TODAY</Text>
        <Text style={styles.hint}>
          Tag who was on site. Builds per-person productivity data over time.
        </Text>

        {crewMembers.length === 0 ? (
          <Text style={styles.noCrewText}>
            No crew members added yet. Add them in Settings → Crew.
          </Text>
        ) : (
          <View style={styles.crewGrid}>
            {crewMembers.map(member => {
              const selected = selectedCrewIds.has(member.id);
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.crewChip, selected && styles.crewChipSelected]}
                  onPress={() => toggleCrew(member.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.crewInitial, selected && styles.crewInitialSelected]}>
                    {member.name.charAt(0).toUpperCase()}
                  </Text>
                  <Text style={[styles.crewName, selected && styles.crewNameSelected]}>
                    {member.name}
                  </Text>
                  {member.trade ? (
                    <Text style={[styles.crewTrade, selected && styles.crewTradeSelected]}>
                      {member.trade}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {selectedCrewIds.size > 0 && (
          <Text style={styles.crewCount}>
            {selectedCrewIds.size} crew member{selectedCrewIds.size !== 1 ? 's' : ''} selected
          </Text>
        )}

        {/* ── NUMBERS ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>DETAILS</Text>

        <Text style={styles.label}>Crew size today</Text>
        <TextInput
          style={styles.input}
          value={crewSize}
          onChangeText={setCrewSize}
          placeholder="e.g. 4"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />
        {selectedCrewIds.size > 0 && (
          <Text style={styles.hint}>
            Auto-filled from tagged crew. Adjust if others were on site too.
          </Text>
        )}

        <Text style={styles.label}>Total crew hours worked</Text>
        <TextInput
          style={styles.input}
          value={hoursWorked}
          onChangeText={setHoursWorked}
          placeholder="e.g. 32  (4 crew × 8 hrs)"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Foreman's % complete estimate (optional)</Text>
        <TextInput
          style={styles.input}
          value={percentComplete}
          onChangeText={setPercentComplete}
          placeholder="e.g. 40  (gut feel on how far along this task is)"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything notable? Delays, conditions, equipment issues…"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Save Log'}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
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

  jobContext: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.border,
  },
  jobName: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  jobLocation: { fontSize: 13, color: Colors.textSecondary },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  progressText: { fontSize: 12, color: Colors.textMuted },

  weatherCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border,
  },
  weatherTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherCapturing: { color: Colors.textMuted, fontSize: 13 },
  weatherMissed: { color: Colors.textMuted, fontSize: 13, flex: 1 },
  retryBtn: { padding: 8 },
  retryText: { color: Colors.primary, fontWeight: '600' },
  weatherGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  coordsText: { fontSize: 11, color: Colors.textMuted },

  taskWarning: {
    color: Colors.warning ?? '#f59e0b',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  taskChip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    marginRight: 8,
  },
  taskChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  taskChipText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  taskChipTextSelected: { color: '#fff' },

  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginTop: 8, marginBottom: -2,
  },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: -4 },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: -2, lineHeight: 18 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: 12, padding: 16,
    color: Colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Colors.border,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },

  // Crew tagger
  noCrewText: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  crewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  crewChip: {
    alignItems: 'center', gap: 4, padding: 12, borderRadius: 14,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    minWidth: 80,
  },
  crewChipSelected: {
    backgroundColor: Colors.primary + '22',
    borderColor: Colors.primary,
  },
  crewInitial: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgInput, textAlign: 'center', lineHeight: 40,
    fontSize: 18, fontWeight: '800', color: Colors.textSecondary,
  },
  crewInitialSelected: { backgroundColor: Colors.primary, color: '#fff' },
  crewName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  crewNameSelected: { color: Colors.primary },
  crewTrade: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  crewTradeSelected: { color: Colors.primary + 'aa' },
  crewCount: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: -4 },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 16,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
