import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../../../../constants/Colors';
import { Card } from '../../../../../components/Card';
import { useTaskDetail } from '../../../../../hooks/useTaskDetail';

export default function TaskDetailScreen() {
  const router = useRouter();
  const { id: jobId, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const [showCrewSummary, setShowCrewSummary] = useState(false);

  const {
    task,
    logs,
    loading,
    error,
    totalLogged,
    percentComplete,
    avgPerDay,
    last7DayAvg,
    estimatedFinish,
    crewSummary,
  } = useTaskDetail(jobId, taskId);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.loadingText}>Task not found.</Text>
      </View>
    );
  }

  const pct = Math.round(percentComplete);
  const progressColor =
    task.status === 'completed' ? Colors.success
    : pct >= 80 ? Colors.success
    : pct >= 40 ? Colors.warning
    : Colors.primary;

  const totalUnits = task.total_units ?? 0;
  const startingUnits = task.starting_units_completed ?? 0;
  const totalCompleted = startingUnits + totalLogged;
  const remaining = Math.max(0, totalUnits - totalCompleted);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={[
          styles.statusBadge,
          task.status === 'completed' && { borderColor: Colors.success },
          task.status === 'active' && { borderColor: Colors.warning },
        ]}>
          <Text style={[
            styles.statusText,
            task.status === 'completed' && { color: Colors.success },
            task.status === 'active' && { color: Colors.warning },
          ]}>
            {task.status}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <Text style={styles.taskName}>{task.name}</Text>
        {task.unit && <Text style={styles.unitLabel}>{task.unit}</Text>}

        {/* Error banner */}
        {error && (
          <Card style={{ borderColor: Colors.danger + '44' }}>
            <Text style={{ color: Colors.danger, fontSize: 13 }}>{error}</Text>
          </Card>
        )}

        {/* Progress card */}
        {totalUnits > 0 && (
          <Card style={[{ gap: 10 }, { borderColor: progressColor + '44' }]}>
            <Text style={[styles.pctLarge, { color: progressColor }]}>{pct}%</Text>
            <View style={styles.progressBg}>
              <View style={[
                styles.progressFill,
                { width: `${pct}%` as any, backgroundColor: progressColor },
              ]} />
            </View>
            <Text style={styles.progressSub}>
              {totalCompleted} of {totalUnits} {task.unit ?? 'units'}
            </Text>
          </Card>
        )}

        {/* Pace card */}
        <Card style={{ gap: 12 }}>
          <Text style={styles.sectionTitle}>Pace</Text>
          <View style={styles.paceRow}>
            <PaceCell
              label={`${task.unit ?? 'units'}/day`}
              value={avgPerDay > 0 ? avgPerDay.toFixed(1) : '—'}
              sub="all time"
            />
            <PaceCell
              label={`${task.unit ?? 'units'}/day`}
              value={last7DayAvg > 0 ? last7DayAvg.toFixed(1) : '—'}
              sub="last 7 days"
              color={last7DayAvg > avgPerDay && avgPerDay > 0 ? Colors.success : undefined}
            />
            <PaceCell
              label="Est. finish"
              value={estimatedFinish ?? (totalUnits === 0 ? 'No target' : '—')}
              sub={remaining > 0 ? `${remaining} remaining` : undefined}
            />
          </View>
        </Card>

        {/* Daily log table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Logs ({logs.length})</Text>
          {logs.length === 0 ? (
            <Text style={styles.mutedText}>No logs for this task yet.</Text>
          ) : (
            <>
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { flex: 2.2 }]}>Date</Text>
                <Text style={[styles.thCell, { flex: 2.5 }]}>Logged By</Text>
                <Text style={[styles.thCell, styles.thRight, { flex: 1.2 }]}>Qty</Text>
                <Text style={[styles.thCell, styles.thRight, { flex: 1.8 }]}>Total</Text>
                <Text style={[styles.thCell, styles.thRight, { flex: 1 }]}>Hrs</Text>
              </View>
              {logs.map((log) => {
                const dateStr = new Date(log.log_date + 'T12:00:00').toLocaleDateString(
                  'en-US', { month: 'short', day: 'numeric' }
                );
                const crewNames = log.log_crew_assignments
                  .filter((a) => a.crew_members)
                  .map((a) => a.crew_members!.name)
                  .join(', ');

                return (
                  <View key={log.id} style={styles.logCard}>
                    <View style={styles.logMainRow}>
                      <Text style={[styles.logCell, { flex: 2.2 }]}>{dateStr}</Text>
                      <Text style={[styles.logCell, { flex: 2.5 }]} numberOfLines={1}>
                        {log.profile_name}
                      </Text>
                      <Text style={[styles.logCell, styles.logRight, { flex: 1.2 }]}>
                        {log.units_completed}
                      </Text>
                      <Text style={[styles.logCell, styles.logRight, styles.logRunning, { flex: 1.8 }]}>
                        {log.running_total}
                      </Text>
                      <Text style={[styles.logCell, styles.logRight, styles.logMuted, { flex: 1 }]}>
                        {log.hours_worked ?? '—'}
                      </Text>
                    </View>
                    {(crewNames || log.notes) && (
                      <View style={styles.logDetail}>
                        {crewNames ? (
                          <Text style={styles.logCrewNames} numberOfLines={2}>
                            👷 {crewNames}
                          </Text>
                        ) : null}
                        {log.notes ? (
                          <Text style={styles.logNotes} numberOfLines={3}>{log.notes}</Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Crew summary (collapsed by default) */}
        {crewSummary.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => setShowCrewSummary((v) => !v)}
              style={styles.crewToggle}
            >
              <Text style={styles.sectionTitle}>
                Crew Summary ({crewSummary.length})
              </Text>
              <Text style={styles.crewToggleChevron}>
                {showCrewSummary ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
            {showCrewSummary && (
              <Card style={{ gap: 6 }}>
                {crewSummary.map((c) => (
                  <View key={c.id} style={styles.crewRow}>
                    <Text style={styles.crewName}>{c.name}</Text>
                    <Text style={styles.crewHours}>
                      {c.totalHours > 0 ? `${c.totalHours.toFixed(1)} hrs` : '—'}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function PaceCell({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <View style={pcStyles.cell}>
      <Text style={[pcStyles.value, color ? { color } : null]}>{value}</Text>
      <Text style={pcStyles.label}>{label}</Text>
      {sub ? <Text style={pcStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const pcStyles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: 4,
    gap: 2,
  },
  value: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  label: { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  sub: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  statusBadge: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    color: Colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  loadingText: { color: Colors.textMuted, padding: 40 },
  content: { padding: 20, gap: 16 },
  taskName: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, lineHeight: 30 },
  unitLabel: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  pctLarge: { fontSize: 48, fontWeight: '900', textAlign: 'center' },
  progressBg: { height: 10, borderRadius: 5, backgroundColor: Colors.bgInput, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressSub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  section: { gap: 8 },
  paceRow: { flexDirection: 'row' },
  mutedText: { color: Colors.textMuted, fontSize: 14 },
  // Table
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  thCell: { fontSize: 10, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  thRight: { textAlign: 'right' },
  logCard: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 8,
    gap: 4,
  },
  logMainRow: { flexDirection: 'row', alignItems: 'center' },
  logCell: { fontSize: 13, color: Colors.textPrimary },
  logRight: { textAlign: 'right' },
  logRunning: { color: Colors.textSecondary },
  logMuted: { color: Colors.textMuted },
  logDetail: { gap: 2, paddingLeft: 4 },
  logCrewNames: { fontSize: 11, color: Colors.textSecondary },
  logNotes: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  // Crew summary
  crewToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crewToggleChevron: { fontSize: 12, color: Colors.textMuted },
  crewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  crewName: { fontSize: 14, color: Colors.textPrimary },
  crewHours: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});
