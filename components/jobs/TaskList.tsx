import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { Task, TaskVariable } from '../../types';

type Props = {
  tasks: Task[];
  taskVars: Record<string, TaskVariable[]>;
  taskProgress: Record<string, number>;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  onDrop: (idx: number) => void;
  onDragEnd: () => void;
  onToggleStatus: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onReorder: (from: number, to: number) => void;
  onAddTask: () => void;
};

export function TaskList({
  tasks, taskVars, taskProgress,
  dragIndex, dragOverIndex,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onToggleStatus, onEdit, onDelete, onReorder, onAddTask,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tasks ({tasks.length})</Text>
        <TouchableOpacity onPress={onAddTask}>
          <Text style={styles.sectionAction}>+ Add task</Text>
        </TouchableOpacity>
      </View>
      {tasks.length === 0 ? (
        <Text style={styles.mutedText}>
          Break the job into tasks to track progress per phase.
        </Text>
      ) : (
        tasks.map((task, idx) => {
          const isDragging = dragIndex === idx;
          const isDragOver = dragOverIndex === idx && dragIndex !== idx;
          const taskContent = (
            <>
              <Text style={[styles.dragHandle, Platform.OS === 'web' && { cursor: 'grab' } as any]}>≡</Text>
              <TouchableOpacity
                onPress={() => onToggleStatus(task)}
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
                {(taskVars[task.id]?.length ?? 0) > 0 && (
                  <View style={styles.taskVarChips}>
                    {taskVars[task.id].map((v) => (
                      <View key={v.id} style={styles.taskVarChip}>
                        <Text style={styles.taskVarChipLabel}>{v.job_variable_types?.name ?? ''}:</Text>
                        <Text style={styles.taskVarChipValue}> {v.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <Text style={[
                styles.taskStatus,
                task.status === 'completed' && { color: Colors.success },
                task.status === 'active' && { color: Colors.warning },
              ]}>
                {task.status}
              </Text>
              <TouchableOpacity onPress={() => onEdit(task)} style={styles.taskActionBtn}>
                <Text style={styles.taskActionEdit}>✎</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(task)} style={styles.taskActionBtn}>
                <Text style={styles.taskActionDelete}>✕</Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && (
                <View style={styles.reorderBtns}>
                  <TouchableOpacity
                    onPress={() => onReorder(idx, idx - 1)}
                    disabled={idx === 0}
                    style={[styles.reorderBtn, idx === 0 && { opacity: 0.2 }]}
                  >
                    <Text style={styles.reorderBtnText}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onReorder(idx, idx + 1)}
                    disabled={idx === tasks.length - 1}
                    style={[styles.reorderBtn, idx === tasks.length - 1 && { opacity: 0.2 }]}
                  >
                    <Text style={styles.reorderBtnText}>▼</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          );

          if (Platform.OS === 'web') {
            return (
              <div
                key={task.id}
                draggable
                onDragStart={(e: any) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(idx); }}
                onDragOver={(e: any) => { e.preventDefault(); onDragOver(idx); }}
                onDrop={(e: any) => { e.preventDefault(); onDrop(idx); }}
                onDragEnd={onDragEnd}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '12px',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #334155',
                  cursor: 'grab',
                  opacity: isDragging ? 0.4 : 1,
                  ...(isDragOver ? { borderTop: '2px solid #f97316' } : {}),
                } as any}
              >
                {taskContent}
              </div>
            );
          }

          return (
            <View
              key={task.id}
              style={[
                styles.taskRow,
                isDragOver && styles.taskRowDragOver,
                isDragging && styles.taskRowDragging,
              ]}
            >
              {taskContent}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  sectionAction: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  mutedText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  taskRowDragOver: { borderTopWidth: 2, borderTopColor: Colors.primary },
  taskRowDragging: { opacity: 0.4 },
  dragHandle: { fontSize: 18, color: Colors.textMuted, paddingHorizontal: 2 },
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
  taskVarChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  taskVarChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgInput, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  taskVarChipLabel: { color: Colors.textMuted, fontSize: 10 },
  taskVarChipValue: { color: Colors.textSecondary, fontSize: 10, fontWeight: '600' },
  taskProgressRow: { gap: 3, marginTop: 4 },
  taskProgressBg: { height: 4, borderRadius: 2, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  taskProgressFill: { height: '100%', borderRadius: 2 },
  reorderBtns: { gap: 2 },
  reorderBtn: { padding: 2 },
  reorderBtnText: { fontSize: 10, color: Colors.textMuted },
});
