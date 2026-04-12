import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Button } from '../Button';
import { Input } from '../Input';
import TaskVariables from '../TaskVariables';
import type { TaskEditHook } from '../../hooks/useTaskEdit';
import type { Job } from '../../types';

type Props = { hook: TaskEditHook; job: Job };

export function EditTaskModal({ hook, job }: Props) {
  const {
    showEditTask, setShowEditTask,
    editingTask,
    editTaskName, setEditTaskName,
    editTaskHours, setEditTaskHours,
    editTaskUnit, setEditTaskUnit,
    editTaskTotalUnits, setEditTaskTotalUnits,
    editTaskStartingUnits, setEditTaskStartingUnits,
    editTaskError, setEditTaskError,
    saveEditTask,
  } = hook;

  return (
    <Modal
      visible={showEditTask}
      transparent
      animationType="slide"
      onRequestClose={() => setShowEditTask(false)}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Edit Task</Text>
          <Input value={editTaskName} onChangeText={setEditTaskName} placeholder="Task name" autoFocus />
          <View style={styles.unitRow}>
            <View style={{ flex: 1 }}>
              <Input value={editTaskTotalUnits} onChangeText={setEditTaskTotalUnits} placeholder="Total (e.g. 316)" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Input value={editTaskUnit} onChangeText={setEditTaskUnit} placeholder="Unit (e.g. rows)" />
            </View>
          </View>
          <Text style={styles.unitHint}>
            Set the count this task is measured by — rows, combiners, feet, sets, etc.
          </Text>
          <Input value={editTaskHours} onChangeText={setEditTaskHours} placeholder="Budgeted man-hours for this task (optional)" keyboardType="numeric" />
          <Input value={editTaskStartingUnits} onChangeText={setEditTaskStartingUnits} placeholder="Units already done before tracking (optional)" keyboardType="numeric" />

          <Text style={styles.label}>Variables</Text>
          <Text style={styles.hint}>
            Track conditions specific to this task — wire gauge, material type, equipment used, etc.
          </Text>
          {editingTask && (
            <TaskVariables
              taskId={editingTask.id}
              tradeCategory={job?.task_types?.category}
            />
          )}

          {!!editTaskError && <Text style={styles.error}>{editTaskError}</Text>}
          <View style={styles.btns}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => { setShowEditTask(false); setEditTaskError(''); }}
              style={{ flex: 1 }}
            />
            <Button label="Save Task" onPress={saveEditTask} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, gap: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 4 },
  hint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -8 },
  unitRow: { flexDirection: 'row', gap: 10 },
  unitHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -8 },
  btns: { flexDirection: 'row', gap: 12 },
  error: {
    color: '#ef4444', fontSize: 13, fontWeight: '600',
    backgroundColor: '#ef444422', borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: '#ef4444',
  },
});
