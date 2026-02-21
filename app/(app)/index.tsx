import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Job } from '../../types';
import { JobCard } from '../../components/JobCard';
import { Colors } from '../../constants/Colors';

export default function DashboardScreen() {
  const { profile, session } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [profile]);

  async function fetchJobs() {
    if (!profile?.company_id) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('jobs')
      .select(`*, task_types(*), job_snapshots(*)`)
      .eq('company_id', profile.company_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setJobs(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  const onRefresh = () => {
    setRefreshing(true);
    fetchJobs();
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
          <Text style={styles.summaryLabel}>Units tracked</Text>
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

        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : activeJobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active jobs yet</Text>
            <Text style={styles.emptyBody}>
              Start by creating your first job. The more you log, the smarter your forecasts get.
            </Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push('/(app)/jobs/new')}
            >
              <Text style={styles.ctaBtnText}>Create your first job</Text>
            </TouchableOpacity>
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
  ctaBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  setupBanner: {
    backgroundColor: Colors.warning + '22', borderRadius: 12,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.warning + '44',
  },
  setupText: { color: Colors.warning, fontSize: 14 },
});
