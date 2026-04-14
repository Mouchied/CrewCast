import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Job } from '../../types';
import { JobCard } from '../../components/JobCard';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useRetryQuery } from '../../hooks/useRetryQuery';
import { Colors } from '../../constants/Colors';
import { Button } from '../../components/Button';

function DashboardScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const queryFn = useCallback(async () => {
    if (!profile?.company_id) {
      return { data: [] as Job[], error: null };
    }
    return await supabase
      .from('jobs')
      .select(`*, task_types(*), job_snapshots(*)`)
      .eq('company_id', profile.company_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
  }, [profile?.company_id]);

  const { data, error, loading, run } = useRetryQuery<Job[]>(queryFn);
  const jobs = data ?? [];

  useEffect(() => {
    run();
  }, [run]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  };

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  const activeJobs = jobs.filter(j => j.status === 'active');
  const totalUnits = jobs.reduce((s, j) => s + (j.job_snapshots?.units_completed ?? 0), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hey, {profile?.full_name?.split(' ')[0] ?? 'there'} 👷
          </Text>
          <Text style={styles.subGreeting}>{new Date().toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
          })}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activeJobs.length}</Text>
          <Text style={styles.summaryLabel}>Active jobs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{jobs.length}</Text>
          <Text style={styles.summaryLabel}>Total jobs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{Math.round(totalUnits).toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Items tracked</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {!profile?.company_id && (
          <View style={styles.setupBanner}>
            <Text style={styles.setupText}>
              Your account setup is incomplete. Please contact support or re-register.
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Jobs</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/jobs/new')}>
            <Text style={styles.sectionAction}>+ New job</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>Failed to load jobs: {error}</Text>
            <TouchableOpacity onPress={run}>
              <Text style={styles.errorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : activeJobs.length === 0 && !error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active jobs yet</Text>
            <Text style={styles.emptyBody}>
              Start by creating your first job. The more you log, the smarter your forecasts get.
            </Text>
            <Button
              label="Create your first job"
              onPress={() => router.push('/(app)/jobs/new')}
            />
          </View>
        ) : (
          activeJobs.map(job => <JobCard key={job.id} job={job} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 24,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subGreeting: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  signOutBtn: { padding: 8 },
  signOutText: { color: Colors.textMuted, fontSize: 13 },

  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  divider: { width: 1, backgroundColor: Colors.border },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  sectionAction: { color: Colors.primary, fontWeight: '600', fontSize: 14 },

  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 40 },
  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptyBody: { color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  setupBanner: {
    backgroundColor: Colors.warning + '22', borderRadius: 12,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.warning + '44',
  },
  setupText: { color: Colors.warning, fontSize: 14 },
  errorBanner: {
    backgroundColor: Colors.danger + '22', borderRadius: 12,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.danger + '44',
    gap: 8,
  },
  errorText: { color: Colors.danger, fontSize: 14 },
  errorRetry: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
});

export default function DashboardScreenWithBoundary() {
  return (
    <ErrorBoundary fallbackTitle="Dashboard failed to load">
      <DashboardScreen />
    </ErrorBoundary>
  );
}
