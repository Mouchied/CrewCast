import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { TaskType } from '../../../types';
import { Colors } from '../../../constants/Colors';
import { reverseGeocode } from '../../../lib/weather';
import JobVariables, { PendingVariable } from '../../../components/JobVariables';

export default function NewJobScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType | null>(null);
  const [totalUnits, setTotalUnits] = useState('');
  const [crewSize, setCrewSize] = useState('');
  const [bidHours, setBidHours] = useState('');
  const [bidCrewSize, setBidCrewSize] = useState('');
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [targetEndDate, setTargetEndDate] = useState('');
  const [jobVariables, setJobVariables] = useState<PendingVariable[]>([]);
  const [notes, setNotes] = useState('');
  const [locationName, setLocationName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customTask, setCustomTask] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [showCustomTask, setShowCustomTask] = useState(false);

  useEffect(() => { fetchTaskTypes(); }, []);

  async function fetchTaskTypes() {
    const { data } = await supabase
      .from('task_types')
      .select('*')
      .order('name');
    setTaskTypes(data ?? []);
  }

  async function detectLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is needed for job site tracking.');
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setLatitude(lat);
      setLongitude(lng);
      const geo = await reverseGeocode(lat, lng);
      if (geo.city) setCity(geo.city);
      if (geo.state) setState(geo.state);
      if (geo.locationName) setLocationName(geo.locationName);
    } catch {
      Alert.alert('Error', 'Could not get location. You can enter it manually.');
    }
    setLocating(false);
  }

  async function handleSubmit() {
    if (!name.trim()) { Alert.alert('Missing field', 'Job name is required.'); return; }
    if (!totalUnits || isNaN(Number(totalUnits))) {
      Alert.alert('Missing field', 'Total units is required.'); return;
    }
    if (!selectedTaskType && !showCustomTask) {
      Alert.alert('Missing field', 'Select a task type.'); return;
    }
    if (showCustomTask && (!customTask.trim() || !customUnit.trim())) {
      Alert.alert('Missing field', 'Enter custom task name and unit.'); return;
    }

    setSubmitting(true);

    let taskTypeId = selectedTaskType?.id;
    let unit = selectedTaskType?.unit ?? customUnit;

    // Create custom task type if needed
    if (showCustomTask) {
      const { data: newTask, error } = await supabase
        .from('task_types')
        .insert({ name: customTask.trim(), unit: customUnit.trim(), created_by: profile?.id })
        .select()
        .single();
      if (error || !newTask) {
        Alert.alert('Error', 'Failed to create task type.');
        setSubmitting(false);
        return;
      }
      taskTypeId = newTask.id;
      unit = newTask.unit;
    }

    // Create the job
    const { data: newJob, error } = await supabase
      .from('jobs')
      .insert({
        company_id: profile?.company_id,
        created_by: profile?.id,
        name: name.trim(),
        task_type_id: taskTypeId,
        total_units: Number(totalUnits),
        unit,
        start_date: startDate,
        target_end_date: targetEndDate || null,
        crew_size: crewSize ? Number(crewSize) : null,
        bid_hours: bidHours ? Number(bidHours) : null,
        bid_crew_size: bidCrewSize ? Number(bidCrewSize) : null,
        location_name: locationName || null,
        city: city || null,
        state: state || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error || !newJob) {
      Alert.alert('Error', error?.message ?? 'Failed to create job.');
      setSubmitting(false);
      return;
    }

    // Save job variables if any were added
    if (jobVariables.length > 0) {
      const rows = jobVariables.map((v) => ({
        job_id: newJob.id,
        variable_type_id: v.variable_type_id,
        value: v.value,
      }));
      const { error: varError } = await supabase
        .from('job_variables')
        .insert(rows);
      if (varError) {
        // Non-fatal — job was created, just log the variable error
        console.warn('Failed to save job variables:', varError.message);
      }
    }

    setSubmitting(false);
    router.replace('/(app)');
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Job</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>JOB INFO</Text>

        <Text style={styles.label}>Job name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Midland Ranch Solar — Phase 2"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Task type *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {taskTypes.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.chip,
                selectedTaskType?.id === t.id && !showCustomTask && styles.chipSelected,
              ]}
              onPress={() => {
                setSelectedTaskType(t);
                setShowCustomTask(false);
                // Clear variables when task type changes (different trade, different catalog)
                setJobVariables([]);
              }}
            >
              <Text style={[
                styles.chipText,
                selectedTaskType?.id === t.id && !showCustomTask && styles.chipTextSelected,
              ]}>
                {t.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, showCustomTask && styles.chipSelected]}
            onPress={() => { setShowCustomTask(true); setSelectedTaskType(null); setJobVariables([]); }}
          >
            <Text style={[styles.chipText, showCustomTask && styles.chipTextSelected]}>
              + Custom
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {showCustomTask && (
          <>
            <Text style={styles.label}>Custom task name *</Text>
            <TextInput
              style={styles.input}
              value={customTask}
              onChangeText={setCustomTask}
              placeholder="e.g. String inverter installation"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.label}>Unit of measure *</Text>
            <TextInput
              style={styles.input}
              value={customUnit}
              onChangeText={setCustomUnit}
              placeholder="e.g. inverters, feet, panels…"
              placeholderTextColor={Colors.textMuted}
            />
          </>
        )}

        {selectedTaskType && !showCustomTask && (
          <View style={styles.infoRow}>
            <Text style={styles.infoText}>
              Unit: <Text style={styles.infoValue}>{selectedTaskType.unit}</Text>
            </Text>
            {selectedTaskType.category && (
              <Text style={styles.infoText}>
                Trade: <Text style={styles.infoValue}>{selectedTaskType.category}</Text>
              </Text>
            )}
          </View>
        )}

        <Text style={styles.label}>Total units to complete *</Text>
        <TextInput
          style={styles.input}
          value={totalUnits}
          onChangeText={setTotalUnits}
          placeholder="e.g. 240"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Default crew size</Text>
        <TextInput
          style={styles.input}
          value={crewSize}
          onChangeText={setCrewSize}
          placeholder="e.g. 4"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        {/* ── Job Variables ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>JOB VARIABLES</Text>
        <Text style={styles.hint}>
          Track the specific conditions for this job — pipe size, wire gauge,
          racking type, shingle brand — so CrewCast can compare productivity
          across the same conditions over time. Works for any trade.
        </Text>

        <JobVariables
          tradeCategory={selectedTaskType?.category ?? undefined}
          variables={jobVariables}
          onChange={setJobVariables}
        />

        {/* ── Bid / Labor Budget ──────────────────────────── */}
        <Text style={styles.sectionLabel}>BID / LABOR BUDGET</Text>
        <Text style={styles.hint}>
          Enter what you bid so CrewCast can track earned value and tell you
          if you're over or under budget.
        </Text>

        <Text style={styles.label}>Bid man-hours (total)</Text>
        <TextInput
          style={styles.input}
          value={bidHours}
          onChangeText={setBidHours}
          placeholder="e.g. 320  (4 crew × 10 days × 8 hrs)"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Bid crew size assumed</Text>
        <TextInput
          style={styles.input}
          value={bidCrewSize}
          onChangeText={setBidCrewSize}
          placeholder="e.g. 4"
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
        />

        {/* ── Dates ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>DATES</Text>

        <Text style={styles.label}>Start date *</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Target / bid end date</Text>
        <TextInput
          style={styles.input}
          value={targetEndDate}
          onChangeText={setTargetEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={Colors.textMuted}
        />

        {/* ── Location ────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>LOCATION</Text>
        <Text style={styles.hint}>
          Location + weather are auto-captured every time you log — critical
          for regional benchmarks.
        </Text>

        <TouchableOpacity style={styles.locateBtn} onPress={detectLocation} disabled={locating}>
          {locating
            ? <ActivityIndicator color={Colors.primary} />
            : <Text style={styles.locateBtnText}>📍 Use current location</Text>
          }
        </TouchableOpacity>

        {locationName ? (
          <View style={styles.locationDetected}>
            <Text style={styles.locationText}>📍 {locationName}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Location name (or enter manually)</Text>
        <TextInput
          style={styles.input}
          value={locationName}
          onChangeText={setLocationName}
          placeholder="e.g. Midland, TX"
          placeholderTextColor={Colors.textMuted}
        />

        {/* ── Notes ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>NOTES</Text>

        <Text style={styles.label}>General notes</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Any other context about this job…"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>
            {submitting ? 'Creating job…' : 'Create Job'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

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
  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, marginTop: 16, marginBottom: -2,
  },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: -4 },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12, padding: 16,
    color: Colors.textPrimary, fontSize: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  chipScroll: { marginTop: 4 },
  chip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    marginRight: 8, marginBottom: 4,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextSelected: { color: '#fff' },
  infoRow: { flexDirection: 'row', gap: 16 },
  infoText: { color: Colors.textMuted, fontSize: 13 },
  infoValue: { color: Colors.textSecondary, fontWeight: '600' },
  hint: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  locateBtn: {
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  locateBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },
  locationDetected: {
    backgroundColor: Colors.primary + '22', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.primary + '44',
  },
  locationText: { color: Colors.primary, fontWeight: '600' },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 16,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
