import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Job, DailyLog, Task, JobVariable, getPaceColor, getForecastSentence } from '../../../types';
import { Colors } from '../../../constants/Colors';
import JobVariables, { jobVariablesToPending } from '../../../components/JobVariables';

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [jobVars, setJobVars] = useState<JobVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');
  const [newTaskUnit, setNewTaskUnit] = useState('');
  const [newTaskTotalUnits, setNewTaskTotalUnits] = useState('');
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editTaskHours, setEditTaskHours] = useState('');
  const [editTaskUnit, setEditTaskUnit] = useState('');
  const [editTaskTotalUnits, setEditTaskTotalUnits] = useState('');
  const [showEditJob, setShowEditJob] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTotalUnits, setEditTotalUnits] = useState('');
  const [editCrewSize, setEditCrewSize] = useState('');
  const [editBidHours, setEditBidHours] = useState('');
  const [editBidCrewSize, setEditBidCrewSize] = useState('');
  const [editStartingUnits, setEditStartingUnits] = useState('');
  const [editStartingHours, setEditStartingHours] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editTargetEndDate, setEditTargetEndDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
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
          .select('*')
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
    if (taskData) setTasks(taskData);
    if (varData) setJobVars(varData);
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
          onPress: async () => {
            const { data, error } = await supabase
              .from('jobs')
              .update({ status: 'completed' })
              .eq('id', id)
              .select('id');
            if (error) Alert.alert('Error', error.message);
            else if (!data?.length) Alert.alert('Error', 'Permission denied — could not update job.');
            else router.replace('/(app)');
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
      unit: newTaskUnit.trim() || null,
      total_units: newTaskTotalUnits ? Number(newTaskTotalUnits) : null,
      sequence_order: tasks.length,
    });
    if (!error) {
      setNewTaskName('');
      setNewTaskHours('');
      setNewTaskUnit('');
      setNewTaskTotalUnits('');
      setShowAddTask(false);
      fetchData();
    }
  }

  function openEditJob() {
    if (!job) return;
    setEditName(job.name);
    setEditTotalUnits(String(job.total_units));
    setEditCrewSize(job.crew_size != null ? String(job.crew_size) : '');
    setEditBidHours(job.bid_hours != null ? String(job.bid_hours) : '');
    setEditBidCrewSize(job.bid_crew_size != null ? String(job.bid_crew_size) : '');
    setEditStartingUnits(job.starting_units_completed != null ? String(job.starting_units_completed) : '');
    setEditStartingHours(job.starting_hours_used != null ? String(job.starting_hours_used) : '');
    setEditStartDate(job.start_date ?? '');
    setEditTargetEndDate(job.target_end_date ?? '');
    setEditNotes(job.notes ?? '');
    setEditLocationName(job.location_name ?? '');
    setShowEditJob(true);
  }

  async function saveEditJob() {
    if (!editName.trim()) { Alert.alert('Missing field', 'Job name is required.'); return; }
    if (!editTotalUnits || isNaN(Number(editTotalUnits))) {
      Alert.alert('Missing field', 'Total units is required.'); return;
    }
    setEditSaving(true);
    const { error } = await supabase.from('jobs').update({
      name: editName.trim(),
      total_units: Number(editTotalUnits),
      crew_size: editCrewSize ? Number(editCrewSize) : null,
      bid_hours: editBidHours ? Number(editBidHours) : null,
      bid_crew_size: editBidCrewSize ? Number(editBidCrewSize) : null,
      starting_units_completed: editStartingUnits ? Number(editStartingUnits) : 0,
      starting_hours_used: editStartingHours ? Number(editStartingHours) : 0,
      start_date: editStartDate || null,
      target_end_date: editTargetEndDate || null,
      notes: editNotes || null,
      location_name: editLocationName || null,
    }).eq('id', id);
    setEditSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowEditJob(false);
    fetchData();
  }

  async function deleteJob() {
    Alert.alert(
      'Delete job?',
      'This will permanently delete the job and all its logs. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { data, error } = await supabase
              .from('jobs')
              .delete()
              .eq('id', id)
              .select('id');
            if (error) Alert.alert('Error', error.message);
            else if (!data?.length) Alert.alert('Error', 'Permission denied — could not delete job.');
            else router.replace('/(app)');
          },
        },
      ]
    );
  }

  async function toggleTaskStatus(task: Task) {
    const nextStatus: Task['status'] =
      task.status === 'pending' ? 'active'
      : task.status === 'active' ? 'completed'
      : 'pending';
    const { error } = await supabase.from('tasks').update({ status: nextStatus }).eq('id', task.id);
    if (error) Alert.alert('Error', error.message);
    else fetchData();
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setEditTaskName(task.name);
    setEditTaskHours(task.estimated_hours != null ? String(task.estimated_hours) : '');
    setEditTaskUnit(task.unit ?? '');
    setEditTaskTotalUnits(task.total_units != null ? String(task.total_units) : '');
    setShowEditTask(true);
  }

  async function saveEditTask() {
    if (!editingTask || !editTaskName.trim()) return;
    const { error } = await supabase.from('tasks').update({
      name: editTaskName.trim(),
      estimated_hours: editTaskHours ? Number(editTaskHours) : null,
      unit: editTaskUnit.trim() || null,
      total_units: editTaskTotalUnits ? Number(editTaskTotalUnits) : null,
    }).eq('id', editingTask.id);
    if (!error) {
      setShowEditTask(false);
      setEditingTask(null);
      fetchData();
    } else {
      Alert.alert('Error', error.message);
    }
  }

  async function deleteTask(task: Task) {
    Alert.alert(
      'Delete task?',
      `"${task.name}" will be permanently removed. Any logs tagged to this task will be unlinked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Unlink any logs referencing this task (avoids FK violation)
            await supabase.from('daily_logs').update({ task_id: null }).eq('task_id', task.id);
            const { data, error } = await supabase
              .from('tasks')
              .delete()
              .eq('id', task.id)
              .select('id');
            if (error) Alert.alert('Error', error.message);
            else if (!data?.length) Alert.alert('Error', 'Permission denied — could not delete task.');
            else fetchData();
          },
        },
      ]
    );
  }

  if (loading || !job) {
    return (
      <View style={styles.container}>
        <Text style={{ color: Colors.textMuted, padding: 40 }}>Loading…</Text>
      </View>
    );
  }

  const snap = job.job_snapshots;
  // Before the first log fires the snapshot trigger, fall back to the starting offset
  const displayCompleted = snap?.units_completed ?? job.starting_units_completed ?? 0;
  const pct = job.total_units > 0
    ? Math.min(100, Math.round((displayCompleted / job.total_units) * 100))
    : 0;

  // Per-task unit progress from logs
  const taskProgress = logs.reduce((acc, log) => {
    if (log.task_id) {
      acc[log.task_id] = (acc[log.task_id] ?? 0) + (log.units_completed ?? 0);
    }
    return acc;
  }, {} as Record<string, number>);

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
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openEditJob} style={styles.editBtn}>
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
        {(() => {
          const isTaskMode = tasks.some(t => t.total_units != null && t.total_units > 0);
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progress</Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: paceColor }]} />
              </View>
              <Text style={styles.progressLabel}>
                {displayCompleted.toFixed(0)} of {job.total_units} {job.unit} — {pct}% complete
              </Text>
              {isTaskMode && (
                <Text style={styles.progressHint}>
                  Avg across {tasks.filter(t => t.total_units != null).length} tasks — each task tracked below
                </Text>
              )}
              {snap?.units_remaining != null && (
                <Text style={styles.remainingLabel}>
                  {snap.units_remaining.toFixed(0)} {job.unit} remaining
                </Text>
              )}
            </View>
          );
        })()}

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
              <View key={task.id} style={styles.taskRow}>
                <TouchableOpacity
                  onPress={() => toggleTaskStatus(task)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[
                    styles.taskDot,
                    task.status === 'completed' && { backgroundColor: Colors.success },
                    task.status === 'active' && { backgroundColor: Colors.warning },
                  ]} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[
                    styles.taskName,
                    task.status === 'completed' && { textDecorationLine: 'line-through', color: Colors.textMuted },
                  ]}>
                    {task.name}
                  </Text>
                  {task.total_units != null && task.unit ? (
                    <View style={styles.taskProgressRow}>
                      <View style={styles.taskProgressBg}>
                        <View style={[
                          styles.taskProgressFill,
                          {
                            width: `${Math.min(100, Math.round(((taskProgress[task.id] ?? 0) / task.total_units) * 100))}%` as any,
                            backgroundColor: task.status === 'completed' ? Colors.success : Colors.primary,
                          },
                        ]} />
                      </View>
                      <Text style={styles.taskMeta}>
                        {(taskProgress[task.id] ?? 0).toFixed(0)} / {task.total_units} {task.unit}
                      </Text>
                    </View>
                  ) : task.estimated_hours != null ? (
                    <Text style={styles.taskMeta}>{task.estimated_hours} hrs estimated</Text>
                  ) : null}
                </View>
                <Text style={[
                  styles.taskStatus,
                  task.status === 'completed' && { color: Colors.success },
                  task.status === 'active' && { color: Colors.warning },
                ]}>
                  {task.status}
                </Text>
                <TouchableOpacity onPress={() => openEditTask(task)} style={styles.taskActionBtn}>
                  <Text style={styles.taskActionEdit}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTask(task)} style={styles.taskActionBtn}>
                  <Text style={styles.taskActionDelete}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── JOB VARIABLES ── */}
        {jobVars.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Variables</Text>
            <JobVariables
              readOnly
              variables={jobVariablesToPending(jobVars)}
            />
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

      {/* Edit Job Modal */}
      <Modal
        visible={showEditJob}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditJob(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.editModalSheet} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Edit Job</Text>

            <Text style={styles.editLabel}>Job name *</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholderTextColor={Colors.textMuted} placeholder="Job name" />

            <Text style={styles.editLabel}>Total units *</Text>
            <Text style={styles.editHint}>The total count of what you're building or installing — e.g. 316 panels, 500 ft of pipe, 24 homes. Every daily log tracks units completed against this number.</Text>
            <TextInput style={styles.modalInput} value={editTotalUnits} onChangeText={setEditTotalUnits} placeholderTextColor={Colors.textMuted} placeholder="e.g. 316" keyboardType="numeric" />

            <Text style={styles.editLabel}>Default crew size</Text>
            <TextInput style={styles.modalInput} value={editCrewSize} onChangeText={setEditCrewSize} placeholderTextColor={Colors.textMuted} placeholder="e.g. 4" keyboardType="numeric" />

            <Text style={styles.editLabel}>Bid man-hours</Text>
            <Text style={styles.editHint}>Total labor hours in your bid/contract for this job.</Text>
            <TextInput style={styles.modalInput} value={editBidHours} onChangeText={setEditBidHours} placeholderTextColor={Colors.textMuted} placeholder="e.g. 1584" keyboardType="numeric" />

            <Text style={styles.editLabel}>Hours already used (starting offset)</Text>
            <Text style={styles.editHint}>Man-hours already burned before you started tracking in CrewCast. Used for accurate burn rate from day one.</Text>
            <TextInput style={styles.modalInput} value={editStartingHours} onChangeText={setEditStartingHours} placeholderTextColor={Colors.textMuted} placeholder="e.g. 320" keyboardType="numeric" />

            <Text style={styles.editLabel}>Units already completed (starting offset)</Text>
            <Text style={styles.editHint}>Rows/units done before you started logging. Progress bar and ETA will start from here.</Text>
            <TextInput style={styles.modalInput} value={editStartingUnits} onChangeText={setEditStartingUnits} placeholderTextColor={Colors.textMuted} placeholder="e.g. 212" keyboardType="numeric" />

            <Text style={styles.editLabel}>Bid crew size</Text>
            <TextInput style={styles.modalInput} value={editBidCrewSize} onChangeText={setEditBidCrewSize} placeholderTextColor={Colors.textMuted} placeholder="e.g. 4" keyboardType="numeric" />

            <Text style={styles.editLabel}>Start date</Text>
            <TextInput style={styles.modalInput} value={editStartDate} onChangeText={setEditStartDate} placeholderTextColor={Colors.textMuted} placeholder="YYYY-MM-DD" />

            <Text style={styles.editLabel}>Target end date</Text>
            <TextInput style={styles.modalInput} value={editTargetEndDate} onChangeText={setEditTargetEndDate} placeholderTextColor={Colors.textMuted} placeholder="YYYY-MM-DD" />

            <Text style={styles.editLabel}>Location name</Text>
            <TextInput style={styles.modalInput} value={editLocationName} onChangeText={setEditLocationName} placeholderTextColor={Colors.textMuted} placeholder="e.g. Midland, TX" />

            <Text style={styles.editLabel}>Notes</Text>
            <TextInput style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]} value={editNotes} onChangeText={setEditNotes} placeholderTextColor={Colors.textMuted} placeholder="Any notes…" multiline />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditJob(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, editSaving && { opacity: 0.6 }]} onPress={saveEditJob} disabled={editSaving}>
                <Text style={styles.modalSaveText}>{editSaving ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        visible={showEditTask}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditTask(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalSheet} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Edit Task</Text>
            <TextInput
              style={styles.modalInput}
              value={editTaskName}
              onChangeText={setEditTaskName}
              placeholder="Task name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.taskUnitRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={editTaskTotalUnits}
                onChangeText={setEditTaskTotalUnits}
                placeholder="Total (e.g. 316)"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={editTaskUnit}
                onChangeText={setEditTaskUnit}
                placeholder="Unit (e.g. rows)"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <Text style={styles.taskUnitHint}>
              Set the count this task is measured by — rows, combiners, feet, sets, etc.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={editTaskHours}
              onChangeText={setEditTaskHours}
              placeholder="Budgeted man-hours for this task (optional)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowEditTask(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEditTask}>
                <Text style={styles.modalSaveText}>Save Task</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Add Task Modal */}
      <Modal
        visible={showAddTask}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTask(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalSheet} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Add Task</Text>
            <TextInput
              style={styles.modalInput}
              value={newTaskName}
              onChangeText={setNewTaskName}
              placeholder="Task name (e.g. Plug mods)"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.taskUnitRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={newTaskTotalUnits}
                onChangeText={setNewTaskTotalUnits}
                placeholder="Total (e.g. 316)"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={newTaskUnit}
                onChangeText={setNewTaskUnit}
                placeholder="Unit (e.g. rows)"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <Text style={styles.taskUnitHint}>
              Set the count this task is measured by — rows, combiners, feet, sets, etc.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={newTaskHours}
              onChangeText={setNewTaskHours}
              placeholder="Budgeted man-hours for this task (optional)"
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
          </ScrollView>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  editBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  deleteBtn: {
    borderWidth: 1, borderColor: Colors.danger, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: 13 },
  completeBtn: {
    borderWidth: 1, borderColor: Colors.success, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  completeBtnText: { color: Colors.success, fontWeight: '600', fontSize: 13 },
  editModalSheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 10, marginTop: 80,
  },
  editLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  editHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: -4 },
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
  progressHint: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },
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
  taskActionBtn: { padding: 6 },
  taskActionEdit: { fontSize: 15, color: Colors.textSecondary },
  taskActionDelete: { fontSize: 13, color: Colors.danger },
  taskProgressRow: { gap: 3, marginTop: 4 },
  taskProgressBg: { height: 4, borderRadius: 2, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  taskProgressFill: { height: '100%', borderRadius: 2 },
  taskUnitRow: { flexDirection: 'row', gap: 10 },
  taskUnitHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -6 },

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
