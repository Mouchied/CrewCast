import { Modal, View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Button } from '../Button';
import { Input } from '../Input';
import type { TaskAddHook } from '../../hooks/useTaskAdd';

type Props = { hook: TaskAddHook };

export function AddTaskModal({ hook }: Props) {
  const {
    showAddTask, setShowAddTask,
    newTaskName, setNewTaskName,
    newTaskHours, setNewTaskHours,
    newTaskUnit, setNewTaskUnit,
    newTaskTotalUnits, setNewTaskTotalUnits,
    newTaskStartingUnits, setNewTaskStartingUnits,
    addTaskError, setAddTaskError,
    addTask,
  } = hook;

  return (
    <Modal
      visible={showAddTask}
      transparent
      animationType="slide"
      onRequestClose={() => setShowAddTask(false)}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Add Task</Text>
          <Input value={newTaskName} onChangeText={setNewTaskName} placeholder="Task name (e.g. Plug mods)" autoFocus />
          <View style={styles.unitRow}>
            <View style={{ flex: 1 }}>
              <Input value={newTaskTotalUnits} onChangeText={setNewTaskTotalUnits} placeholder="Total (e.g. 316)" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Input value={newTaskUnit} onChangeText={setNewTaskUnit} placeholder="Unit (e.g. rows)" />
            </View>
          </View>
          <Text style={styles.unitHint}>
            Set the count this task is measured by — rows, combiners, feet, sets, etc.
          </Text>
          <Input value={newTaskHours} onChangeText={setNewTaskHours} placeholder="Budgeted man-hours for this task (optional)" keyboardType="numeric" />
          <Input value={newTaskStartingUnits} onChangeText={setNewTaskStartingUnits} placeholder="Units already done before tracking (optional)" keyboardType="numeric" />
          {!!addTaskError && <Text style={styles.error}>{addTaskError}</Text>}
          <View style={styles.btns}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => { setShowAddTask(false); setAddTaskError(''); }}
              style={{ flex: 1 }}
            />
            <Button label="Add Task" onPress={addTask} style={{ flex: 1 }} />
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
  unitRow: { flexDirection: 'row', gap: 10 },
  unitHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: -8 },
  btns: { flexDirection: 'row', gap: 12 },
  error: {
    color: '#ef4444', fontSize: 13, fontWeight: '600',
    backgroundColor: '#ef444422', borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: '#ef4444',
  },
});
