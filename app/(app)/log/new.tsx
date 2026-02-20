import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { Job, Task, WeatherData } from '../../../types';
import { Colors } from '../../../constants/Colors';
import { fetchWeather } from '../../../lib/weather';

export default function NewLogScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { profile } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [percentComplete, setPercentComplete] = useState('');
  const [unitsCompleted, setUnitsCompleted] = useState('');
  const [crewSize, setCrewSize] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (jobId) fetchJob();
    autoCapture();
  }, [jobId]);

  async function fetchJob() {
    const [{ data: jobData }, { data: taskData }] = await Promise.all([
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
    ]);
    if (jobData) {
      setJob(jobData);
      if (jobData.crew_size) setCrewSize(String(jobData.crew_size));
    }
    if (taskData) setTasks(taskData);
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

  async function handleSubmit() {
    if (!unitsCompleted || isNaN(Number(unitsCompleted))) {
      Alert.alert('Missing field', 'Enter how many units were completed today.');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('daily_logs').insert({
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
    });

    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        Alert.alert('Already logged', 'A log for this date already exists. Delete it first to re-log.');
      } else {
        Alert.alert('Error', error.message);
      }
      return;
    }

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
        <Text style={styles.title}>Log Today</Text>
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
        </View>

        <Text style={styles.sectionLabel}>LOG ENTRY</Text>

        {/* Task selection — optional, only shown if job has tasks */}
        {tasks.length > 0 && (
          <>
            <Text style={styles.label}>Task worked on today</Text>
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

        <Text style={styles.label}>
          {job ? `${job.unit.charAt(0).toUpperCase() + job.unit.slice(1)} completed today *` : 'Units completed *'}
        </Text>
        <TextInput
          style={styles.input}
          value={unitsCompleted}
          onChangeText={setUnitsCompleted}
          placeholder={`e.g. ${job?.job_snapshots?.avg_units_per_day?.toFixed(0) ?? '12'}`}
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        {snap?.avg_units_per_day ? (
          <Text style={styles.hint}>
            Your average is {snap.avg_units_per_day.toFixed(1)} {job?.unit}/day
          </Text>
        ) : null}

        <Text style={styles.label}>Crew size today</Text>
        <TextInput
          style={styles.input}
          value={crewSize}
          onChangeText={setCrewSize}
          placeholder="e.g. 4"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

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
          placeholder="e.g. 40  (your gut feel on how far along this task is)"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything notable about today? Delays, conditions, equipment issues…"
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
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: -4 },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: 12, padding: 16,
    color: Colors.textPrimary, fontSize: 16, borderWidth: 1, borderColor: Colors.border,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 16,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
