import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { CompanyBenchmark, VariableProductivityBenchmark } from '../../types';
import { Colors } from '../../constants/Colors';

export default function BenchmarksScreen() {
  const { profile } = useAuth();
  const [benchmarks, setBenchmarks] = useState<CompanyBenchmark[]>([]);
  const [varBenchmarks, setVarBenchmarks] = useState<VariableProductivityBenchmark[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (profile?.company_id) fetchData(); }, [profile]);

  async function fetchData() {
    if (!profile?.company_id) return;

    const [{ data: bmData }, { data: jobData }, { data: varBmData }] = await Promise.all([
      supabase
        .from('company_benchmarks')
        .select('*')
        .eq('company_id', profile.company_id),
      supabase
        .from('jobs')
        .select(`
          id, name, unit, total_units, status, location_name, state,
          task_types(name),
          job_snapshots(avg_units_per_day, last_7_day_avg, burn_rate, pace_status, total_days_logged)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('variable_productivity_benchmarks')
        .select('*')
        .eq('company_id', profile.company_id)
        .gte('job_count', 2),   // only show variables with 2+ jobs for meaningful comparison
    ]);

    setBenchmarks(bmData ?? []);
    setJobs(jobData ?? []);
    setVarBenchmarks(varBmData ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  function onRefresh() {
    setRefreshing(true);
    fetchData();
  }

  // Compute company-level summary from jobs
  const activeJobs = jobs.filter(j => j.status === 'active');
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const avgBurnRate = jobs
    .filter(j => j.job_snapshots?.burn_rate != null)
    .reduce((s, j, _, arr) => s + j.job_snapshots.burn_rate / arr.length, 0);

  // Find best/worst performing jobs (by pace vs avg)
  const jobsWithData = jobs.filter(j => j.job_snapshots?.avg_units_per_day);
  const bestJob = jobsWithData.reduce<any>((best, j) =>
    !best || j.job_snapshots.avg_units_per_day > best.job_snapshots.avg_units_per_day ? j : best, null);
  const worstJob = jobsWithData.reduce<any>((worst, j) =>
    !worst || j.job_snapshots.avg_units_per_day < worst.job_snapshots.avg_units_per_day ? j : worst, null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Benchmarks</Text>
        <Text style={styles.subtitle}>Your company's productivity data</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.empty}>Loading your data…</Text>
        ) : jobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyBody}>
              Complete at least 3 days of logging on a job to start seeing benchmarks.
              The more jobs you log, the more powerful your data becomes.
            </Text>
          </View>
        ) : (
          <>
            {/* ── COMPANY SUMMARY ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Company Overview</Text>
              <View style={styles.summaryGrid}>
                <SummaryCard label="Active jobs" value={String(activeJobs.length)} />
                <SummaryCard label="Completed jobs" value={String(completedJobs.length)} />
                <SummaryCard
                  label="Avg burn rate"
                  value={avgBurnRate > 0 ? `${(avgBurnRate * 100).toFixed(0)}%` : '—'}
                  sub="vs labor budget"
                  color={avgBurnRate > 1.1 ? Colors.danger : avgBurnRate > 0 ? Colors.success : undefined}
                />
                <SummaryCard label="Total jobs" value={String(jobs.length)} />
              </View>
            </View>

            {/* ── BEST / WORST JOBS ── */}
            {bestJob && worstJob && bestJob.id !== worstJob.id && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Performance Comparison</Text>

                <View style={styles.compareRow}>
                  <View style={[styles.compareCard, { borderColor: Colors.success + '55' }]}>
                    <Text style={styles.compareLabel}>BEST PACE</Text>
                    <Text style={styles.compareName} numberOfLines={2}>{bestJob.name}</Text>
                    <Text style={styles.compareValue}>
                      {bestJob.job_snapshots.avg_units_per_day.toFixed(1)}
                    </Text>
                    <Text style={styles.compareUnit}>{bestJob.unit}/day avg</Text>
                    {bestJob.location_name && (
                      <Text style={styles.compareLocation}>📍 {bestJob.location_name}</Text>
                    )}
                  </View>
                  <View style={[styles.compareCard, { borderColor: Colors.danger + '55' }]}>
                    <Text style={[styles.compareLabel, { color: Colors.danger }]}>SLOWEST PACE</Text>
                    <Text style={styles.compareName} numberOfLines={2}>{worstJob.name}</Text>
                    <Text style={[styles.compareValue, { color: Colors.danger }]}>
                      {worstJob.job_snapshots.avg_units_per_day.toFixed(1)}
                    </Text>
                    <Text style={styles.compareUnit}>{worstJob.unit}/day avg</Text>
                    {worstJob.location_name && (
                      <Text style={styles.compareLocation}>📍 {worstJob.location_name}</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* ── BENCHMARKS BY TASK TYPE ── */}
            {benchmarks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By Task Type</Text>
                <Text style={styles.sectionHint}>
                  Averages across all your jobs with enough data. Use this to spot patterns and set better bids.
                </Text>
                {benchmarks.map(bm => (
                  <BenchmarkRow key={`${bm.task_type_id}-${bm.state}`} bm={bm} />
                ))}
              </View>
            )}

            {/* ── VARIABLE PRODUCTIVITY INSIGHTS ── */}
            {varBenchmarks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>By Job Variable</Text>
                <Text style={styles.sectionHint}>
                  How does productivity change based on specific conditions?
                  These insights only appear when you have 2+ jobs with the same variable.
                </Text>
                <VarInsightList items={varBenchmarks} />
              </View>
            )}

            {/* ── ALL JOBS TABLE ── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>All Jobs — Pace Data</Text>
              {jobs
                .filter(j => j.job_snapshots?.total_days_logged > 0)
                .map(job => (
                  <JobPaceRow key={job.id} job={job} />
                ))
              }
              {jobs.filter(j => j.job_snapshots?.total_days_logged > 0).length === 0 && (
                <Text style={styles.empty}>Log work on your jobs to see pace data here.</Text>
              )}
            </View>

            {/* ── DATA MOAT CALLOUT ── */}
            <View style={styles.moatCard}>
              <Text style={styles.moatTitle}>Your data is your edge.</Text>
              <Text style={styles.moatBody}>
                Every log you submit builds a historical record unique to your company.
                {'\n\n'}
                The more jobs you track — different locations, crew sizes, seasons, and materials — the more
                accurate your future bids get. No other contractor has your data.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={smStyles.card}>
      <Text style={[smStyles.value, color && { color }]}>{value}</Text>
      {sub && <Text style={smStyles.sub}>{sub}</Text>}
      <Text style={smStyles.label}>{label}</Text>
    </View>
  );
}
const smStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.bgCard,
    borderRadius: 12, padding: 14, alignItems: 'center', gap: 2,
    borderWidth: 1, borderColor: Colors.border,
  },
  value: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 10, color: Colors.textMuted },
  label: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
});

function BenchmarkRow({ bm }: { bm: CompanyBenchmark }) {
  return (
    <View style={bmStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={bmStyles.name}>{bm.task_type_name}</Text>
        <View style={bmStyles.meta}>
          <Text style={bmStyles.metaText}>{bm.job_count} job{bm.job_count !== 1 ? 's' : ''}</Text>
          {bm.state && <Text style={bmStyles.metaText}>📍 {bm.state}</Text>}
          {bm.avg_temp_f != null && <Text style={bmStyles.metaText}>{bm.avg_temp_f}°F avg</Text>}
        </View>
        <View style={bmStyles.rangeRow}>
          <Text style={bmStyles.rangeText}>
            {bm.min_units_per_day.toFixed(1)} – {bm.max_units_per_day.toFixed(1)} {bm.unit}/day range
          </Text>
        </View>
      </View>
      <View style={bmStyles.right}>
        <Text style={bmStyles.avg}>{bm.avg_units_per_day.toFixed(1)}</Text>
        <Text style={bmStyles.avgLabel}>{bm.unit}/day avg</Text>
      </View>
    </View>
  );
}
const bmStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  meta: { flexDirection: 'row', gap: 10, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  rangeRow: { marginTop: 4 },
  rangeText: { fontSize: 11, color: Colors.textMuted },
  right: { alignItems: 'center' },
  avg: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  avgLabel: { fontSize: 10, color: Colors.textMuted },
});

function JobPaceRow({ job }: { job: any }) {
  const snap = job.job_snapshots;
  return (
    <View style={jpStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={jpStyles.name} numberOfLines={1}>{job.name}</Text>
        <View style={jpStyles.meta}>
          {job.task_types?.name && <Text style={jpStyles.tag}>{job.task_types.name}</Text>}
          {job.location_name && <Text style={jpStyles.metaText}>📍 {job.location_name}</Text>}
        </View>
      </View>
      <View style={jpStyles.right}>
        <Text style={jpStyles.pace}>{snap?.avg_units_per_day?.toFixed(1) ?? '—'}</Text>
        <Text style={jpStyles.unit}>{job.unit}/day</Text>
        <Text style={jpStyles.days}>{snap?.total_days_logged ?? 0}d logged</Text>
      </View>
    </View>
  );
}
const jpStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  meta: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  tag: {
    fontSize: 11, color: Colors.primary, backgroundColor: Colors.primary + '22',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '600',
  },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  right: { alignItems: 'flex-end' },
  pace: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  unit: { fontSize: 10, color: Colors.textMuted },
  days: { fontSize: 11, color: Colors.textMuted },
});

// ── Variable Productivity Insights ───────────────────────────

function VarInsightList({ items }: { items: VariableProductivityBenchmark[] }) {
  // Group by variable_name so we can show comparisons within each variable
  const grouped = items.reduce<Record<string, VariableProductivityBenchmark[]>>(
    (acc, item) => {
      const key = `${item.variable_name}||${item.trade_category ?? 'all'}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {}
  );

  return (
    <View style={viStyles.container}>
      {Object.entries(grouped).map(([key, rows]) => {
        const sorted = [...rows].sort(
          (a, b) => b.avg_units_per_day - a.avg_units_per_day
        );
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        const variableName = rows[0].variable_name;
        const category = rows[0].trade_category;
        const unit = rows[0].work_unit ?? 'units';

        return (
          <View key={key} style={viStyles.group}>
            <View style={viStyles.groupHeader}>
              <Text style={viStyles.varName}>{variableName}</Text>
              {category && (
                <Text style={viStyles.category}>{category}</Text>
              )}
            </View>

            {sorted.map((item) => {
              const isBest = item.variable_value === best.variable_value;
              const isWorst =
                item.variable_value === worst.variable_value &&
                sorted.length > 1;
              return (
                <View key={item.variable_value} style={viStyles.row}>
                  <View style={viStyles.rowLeft}>
                    <Text style={viStyles.value}>
                      {item.variable_value}
                      {item.variable_unit ? ` ${item.variable_unit}` : ''}
                    </Text>
                    <Text style={viStyles.meta}>
                      {item.job_count} job{item.job_count !== 1 ? 's' : ''}
                      {item.avg_crew_size
                        ? ` · ${item.avg_crew_size.toFixed(1)} crew avg`
                        : ''}
                      {item.state ? ` · ${item.state}` : ''}
                    </Text>
                  </View>
                  <View style={viStyles.rowRight}>
                    <Text
                      style={[
                        viStyles.pace,
                        isBest && { color: Colors.success },
                        isWorst && { color: Colors.danger },
                      ]}
                    >
                      {item.avg_units_per_day.toFixed(1)}
                    </Text>
                    <Text style={viStyles.paceUnit}>{unit}/day</Text>
                  </View>
                </View>
              );
            })}

            {sorted.length > 1 && (
              <Text style={viStyles.insight}>
                {best.variable_value} is{' '}
                {(
                  ((best.avg_units_per_day - worst.avg_units_per_day) /
                    worst.avg_units_per_day) *
                  100
                ).toFixed(0)}
                % faster than {worst.variable_value}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const viStyles = StyleSheet.create({
  container: { gap: 16 },
  group: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.border,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  varName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  category: {
    fontSize: 10, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primary + '22', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLeft: { flex: 1 },
  value: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  pace: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  paceUnit: { fontSize: 10, color: Colors.textMuted },
  insight: {
    fontSize: 12, color: Colors.success, fontWeight: '600',
    fontStyle: 'italic', marginTop: 4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 24, paddingTop: 60,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },
  content: { padding: 20, gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  sectionHint: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  compareRow: { flexDirection: 'row', gap: 12 },
  compareCard: {
    flex: 1, backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 14, gap: 4, borderWidth: 1,
  },
  compareLabel: { fontSize: 10, fontWeight: '700', color: Colors.success, letterSpacing: 0.8 },
  compareName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18 },
  compareValue: { fontSize: 26, fontWeight: '800', color: Colors.success, marginTop: 4 },
  compareUnit: { fontSize: 11, color: Colors.textMuted },
  compareLocation: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyBody: { color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  moatCard: {
    backgroundColor: Colors.primary + '15', borderRadius: 14,
    padding: 20, gap: 8, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  moatTitle: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  moatBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
});
