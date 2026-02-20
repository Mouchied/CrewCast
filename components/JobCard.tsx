import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Job } from '../types';
import { Colors } from '../constants/Colors';

interface Props {
  job: Job;
}

export function JobCard({ job }: Props) {
  const router = useRouter();
  const snap = job.job_snapshots;

  const pct = snap && job.total_units > 0
    ? Math.min(100, Math.round((snap.units_completed / job.total_units) * 100))
    : 0;

  const scheduleColor =
    snap?.days_ahead_behind == null ? Colors.textMuted
    : snap.days_ahead_behind >= 0 ? Colors.ahead
    : Colors.behind;

  const scheduleText =
    snap?.days_ahead_behind == null ? null
    : snap.days_ahead_behind === 0 ? 'On track'
    : snap.days_ahead_behind > 0 ? `${snap.days_ahead_behind}d ahead`
    : `${Math.abs(snap.days_ahead_behind)}d behind`;

  const etaText = snap?.estimated_finish_date
    ? new Date(snap.estimated_finish_date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : 'Logging needed';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/jobs/${job.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={1}>{job.name}</Text>
        {scheduleText && (
          <Text style={[styles.badge, { color: scheduleColor }]}>{scheduleText}</Text>
        )}
      </View>

      {job.location_name ? (
        <Text style={styles.location}>{job.location_name}</Text>
      ) : null}

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{pct}%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{snap?.avg_units_per_day?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.statLabel}>{job.unit}/day avg</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{etaText}</Text>
          <Text style={styles.statLabel}>Est. finish</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {snap?.units_completed?.toFixed(0) ?? 0} / {job.total_units} {job.unit}
        </Text>
        <Text style={styles.footerText}>
          {snap?.total_days_logged ?? 0} days logged
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, flex: 1, marginRight: 8 },
  badge: { fontSize: 12, fontWeight: '700' },
  location: { fontSize: 13, color: Colors.textSecondary },
  progressBg: {
    height: 6, borderRadius: 3, backgroundColor: Colors.bgInput, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: 3,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: { fontSize: 12, color: Colors.textMuted },
});
