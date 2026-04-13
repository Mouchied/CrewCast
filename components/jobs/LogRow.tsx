import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { DailyLog } from '../../types';

type Props = {
  log: DailyLog;
  unit: string;
  onDelete: (id: string) => void;
};

export function LogRow({ log, unit, onDelete }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.date}>
          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          })}
        </Text>
        <View style={styles.meta}>
          {log.tasks?.name && <Text style={styles.taskTag}>{log.tasks.name}</Text>}
          {log.crew_size != null && <Text style={styles.metaText}>{log.crew_size} crew</Text>}
          {log.hours_worked != null && <Text style={styles.metaText}>{log.hours_worked}h</Text>}
          {log.weather_condition && (
            <Text style={styles.metaText}>
              {log.weather_temp_f}°F · {log.weather_condition}
            </Text>
          )}
        </View>
        {log.notes ? <Text style={styles.notes} numberOfLines={1}>{log.notes}</Text> : null}
      </View>
      <View style={styles.right}>
        {log.percent_complete != null ? (
          <>
            <Text style={styles.units}>{log.percent_complete}%</Text>
            <Text style={styles.unitLabel}>{log.units_completed} {unit}</Text>
          </>
        ) : (
          <>
            <Text style={styles.units}>{log.units_completed}</Text>
            <Text style={styles.unitLabel}>{unit}</Text>
          </>
        )}
        <TouchableOpacity onPress={() => onDelete(log.id)} style={styles.delBtn}>
          <Text style={styles.delText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
