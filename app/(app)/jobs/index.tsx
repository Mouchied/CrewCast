import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { Job } from '../../../types';
import { JobCard } from '../../../components/JobCard';
import { Colors } from '../../../constants/Colors';

type Filter = 'active' | 'completed' | 'all';

export default function JobsScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');

  // Refetch whenever the screen comes into focus (e.g. after creating a job)
  useFocusEffect(
    useCallback(() => { fetchJobs(); }, [profile, filter])
  );

  async function fetchJobs() {
    if (!profile?.company_id) { setLoading(false); return; }
    let query = supabase
      .from('jobs')
      .select(`*, task_types(*), job_snapshots(*)`)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (filter !== 'all') query = query.eq('status', filter);

    const { data, error } = await query;
    if (error) Alert.alert('Error', error.message);
    else setJobs(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <TouchableOpacity
          onPress={() => router.push('/(app)/jobs/new')}
          style={styles.newBtn}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterBtn, filter === f.key && styles.filterBtnActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchJobs(); }}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : jobs.length === 0 ? (
          <Text style={styles.empty}>No {filter !== 'all' ? filter : ''} jobs found.</Text>
        ) : (
          jobs.map(job => <JobCard key={job.id} job={job} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 24, paddingTop: 60,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  newBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  filterRow: {
    flexDirection: 'row', padding: 16, gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  filterBtn: {
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  filterTextActive: { color: '#fff' },
  list: { padding: 20, paddingBottom: 100 },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: 60 },
});
