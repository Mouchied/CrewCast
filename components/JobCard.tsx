import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Job, getPaceColor, getPaceLabel, getForecastSentence } from '../types';
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

  const paceStatus = snap?.pace_status;
  const statusColor = getPaceColor(paceStatus);
  const statusLabel = getPaceLabel(paceStatus);
  const forecastText = getForecastSentence(job);

  const burnRateText = snap?.burn_rate != null
    ? `${(snap.burn_rate * 100).toFixed(0)}% burn`
    : null;
  const burnColor = snap?.burn_rate != null
    ? snap.burn_rate > 1.1 ? Colors.danger
    : snap.burn_rate < 0.95 ? Colors.success
    : Colors.textSecondary
    : Colors.textSecondary;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/jobs/${job.id}`)}
      activeOpacity={0.8}
    >
      {/* Status dot + job name + badge */}
      <View style={styles.topRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.name} numberOfLines={1}>{job.name}</Text>
        <View style={[styles.badge, { borderColor: statusColor + '55' }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {job.location_name ? (
        <Text style={styles.location}>📍 {job.location_name}</Text>
      ) : null}

      {/* The core forecast sentence from the brief */}
      {forecastText ? (
        <Text style={styles.forecastText}>{forecastText}</Text>
      ) : (
        <Text style={styles.noLogs}>Log today's work to start forecasting.</Text>
      )}

      {/* Progress bar — colored by pace status */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: statusColor }]} />
      </View>
      {snap && job.total_units > 0 && (
        <Text style={styles.progressCount}>
          {(snap.units_completed ?? 0).toFixed(0)} / {job.total_units} {job.unit || 'items'}
        </Text>
      )}

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{pct}%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {snap?.last_7_day_avg?.toFixed(1) ?? snap?.avg_units_per_day?.toFixed(1) ?? '—'}
          </Text>
          <Text style={styles.statLabel}>{job.unit}/day</Text>
        </View>
        {burnRateText ? (
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: burnColor }]}>{burnRateText}</Text>
            <Text style={styles.statLabel}>vs budget</Text>
          </View>
        ) : (
          <View style={styles.stat}>
            <Text style={styles.statValue}>{snap?.total_days_logged ?? 0}</Text>
            <Text style={styles.statLabel}>Days logged</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  location: { fontSize: 13, color: Colors.textSecondary, marginLeft: 20 },
  forecastText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
    fontWeight: '500',
    marginLeft: 20,
  },
  noLogs: {
    fontSize: 13,
    color: Colors.textMuted,
    marginLeft: 20,
    fontStyle: 'italic',
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgInput,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressCount: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});
