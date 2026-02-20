import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Company, CompanySubscription, TaskType } from '../../types';
import { Colors } from '../../constants/Colors';

export default function SettingsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [subscription, setSubscription] = useState<CompanySubscription | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [customTaskTypes, setCustomTaskTypes] = useState<TaskType[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskUnit, setNewTaskUnit] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => { if (profile?.company_id) fetchData(); }, [profile]);

  async function fetchData() {
    if (!profile?.company_id) return;

    const [
      { data: companyData },
      { data: subData },
      { data: teamData },
      { data: taskData },
    ] = await Promise.all([
      supabase.from('companies').select('*').eq('id', profile.company_id).single(),
      supabase
        .from('company_subscriptions')
        .select('*, plans(*)')
        .eq('company_id', profile.company_id)
        .single(),
      supabase
        .from('profiles')
        .select('id, full_name, role, created_at')
        .eq('company_id', profile.company_id)
        .order('created_at'),
      supabase
        .from('task_types')
        .select('*')
        .eq('is_global', false)
        .eq('created_by', profile.id)
        .order('name'),
    ]);

    if (companyData) setCompany(companyData);
    if (subData) setSubscription(subData as any);
    if (teamData) setTeamMembers(teamData);
    if (taskData) setCustomTaskTypes(taskData);
  }

  async function sendInvite() {
    if (!inviteEmail.trim() || !profile?.company_id) return;
    setInviting(true);

    const { error } = await supabase.from('company_invitations').insert({
      company_id: profile.company_id,
      invited_by: profile.id,
      email: inviteEmail.trim().toLowerCase(),
      role: 'foreman',
    });

    setInviting(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setInviteEmail('');
      Alert.alert(
        'Invitation created',
        `An invite link has been generated for ${inviteEmail}. Share it with them to join your company.`
      );
    }
  }

  async function addCustomTaskType() {
    if (!newTaskName.trim() || !newTaskUnit.trim()) return;
    setAddingTask(true);

    const { error } = await supabase.from('task_types').insert({
      name: newTaskName.trim(),
      unit: newTaskUnit.trim(),
      created_by: profile?.id,
      is_global: false,
    });

    setAddingTask(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewTaskName('');
      setNewTaskUnit('');
      fetchData();
    }
  }

  async function signOut() {
    Alert.alert('Sign out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const plan = (subscription as any)?.plans;
  const isTrialing = subscription?.status === 'trialing';
  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(0, Math.ceil(
        (new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000
      ))
    : null;

  const planColor = plan?.id === 'enterprise' ? Colors.warning
    : plan?.id === 'growth' ? Colors.info
    : Colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── COMPANY PROFILE ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company</Text>
          <View style={styles.card}>
            <Row label="Name" value={company?.name ?? '—'} />
            <Row label="Industry" value={company?.industry ?? 'Not set'} />
            <Row label="Your role" value={profile?.role ?? '—'} />
          </View>
        </View>

        {/* ── SUBSCRIPTION ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <View style={styles.planRow}>
              <View>
                <Text style={[styles.planName, { color: planColor }]}>
                  {plan?.name ?? 'Free'} Plan
                </Text>
                {isTrialing && trialDaysLeft != null && (
                  <Text style={styles.trialBadge}>
                    {trialDaysLeft} days left in trial
                  </Text>
                )}
                {!isTrialing && (
                  <Text style={styles.subStatus}>
                    {subscription?.status === 'active' ? 'Active' : subscription?.status ?? 'Unknown'}
                  </Text>
                )}
              </View>
              {plan?.price_monthly > 0 ? (
                <Text style={styles.price}>${plan.price_monthly}/mo</Text>
              ) : (
                <Text style={styles.price}>Free</Text>
              )}
            </View>

            {plan && (
              <View style={styles.limitsRow}>
                <Text style={styles.limitText}>
                  {plan.max_users != null ? `Up to ${plan.max_users} users` : 'Unlimited users'}
                </Text>
                <Text style={styles.limitText}>
                  {plan.max_jobs != null ? `Up to ${plan.max_jobs} active jobs` : 'Unlimited jobs'}
                </Text>
              </View>
            )}
          </View>

          {/* Upgrade prompt if on starter */}
          {plan?.id === 'starter' && (
            <View style={styles.upgradeCard}>
              <Text style={styles.upgradeTitle}>Ready to grow?</Text>
              <Text style={styles.upgradeBody}>
                Growth plan: $250/mo — 20 active jobs, unlimited users, cross-job benchmarks.
              </Text>
              <TouchableOpacity style={styles.upgradeBtn}>
                <Text style={styles.upgradeBtnText}>Upgrade to Growth →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── TEAM MEMBERS ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team ({teamMembers.length})</Text>
          <View style={styles.card}>
            {teamMembers.map(member => (
              <View key={member.id} style={styles.memberRow}>
                <View>
                  <Text style={styles.memberName}>
                    {member.full_name}
                    {member.id === profile?.id ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.memberRole}>{member.role}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Invite */}
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>Invite a team member</Text>
            <View style={styles.inviteRow}>
              <TextInput
                style={styles.inviteInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="foreman@company.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.inviteBtn, inviting && { opacity: 0.6 }]}
                onPress={sendInvite}
                disabled={inviting}
              >
                <Text style={styles.inviteBtnText}>{inviting ? '…' : 'Invite'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── CUSTOM TASK TYPES ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Custom Task Types</Text>
          <Text style={styles.sectionHint}>
            These appear in your job creation alongside the global catalog.
          </Text>
          {customTaskTypes.length === 0 ? (
            <Text style={styles.emptyText}>
              No custom task types yet. Add one below or create them when making a job.
            </Text>
          ) : (
            <View style={styles.card}>
              {customTaskTypes.map(t => (
                <View key={t.id} style={styles.taskTypeRow}>
                  <Text style={styles.taskTypeName}>{t.name}</Text>
                  <Text style={styles.taskTypeUnit}>{t.unit}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.addTaskCard}>
            <TextInput
              style={styles.input}
              value={newTaskName}
              onChangeText={setNewTaskName}
              placeholder="Task type name (e.g. String inverter installation)"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={styles.input}
              value={newTaskUnit}
              onChangeText={setNewTaskUnit}
              placeholder="Unit (e.g. inverters, feet, panels)"
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity
              style={[styles.addBtn, addingTask && { opacity: 0.6 }]}
              onPress={addCustomTaskType}
              disabled={addingTask}
            >
              <Text style={styles.addBtnText}>+ Add Task Type</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── ACCOUNT ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Row label="Email" value={session?.user?.email ?? '—'} />
            <Row label="Name" value={profile?.full_name ?? '—'} />
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  label: { fontSize: 14, color: Colors.textSecondary },
  value: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    padding: 24, paddingTop: 60,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  content: { padding: 20, gap: 24 },

  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  sectionHint: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  card: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    paddingHorizontal: 16, borderWidth: 1, borderColor: Colors.border,
  },

  planRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 14,
  },
  planName: { fontSize: 18, fontWeight: '800' },
  trialBadge: { fontSize: 12, color: Colors.warning, marginTop: 4 },
  subStatus: { fontSize: 12, color: Colors.textMuted, marginTop: 4, textTransform: 'capitalize' },
  price: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  limitsRow: {
    flexDirection: 'row', gap: 16, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10,
  },
  limitText: { fontSize: 13, color: Colors.textSecondary },

  upgradeCard: {
    backgroundColor: Colors.primary + '15', borderRadius: 14,
    padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.primary + '33',
  },
  upgradeTitle: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  upgradeBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  upgradeBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  upgradeBtnText: { color: '#fff', fontWeight: '700' },

  memberRow: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  memberName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  memberRole: { fontSize: 12, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },

  inviteCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border,
  },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  inviteRow: { flexDirection: 'row', gap: 8 },
  inviteInput: {
    flex: 1, backgroundColor: Colors.bgInput, borderRadius: 10,
    padding: 12, color: Colors.textPrimary, fontSize: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  inviteBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  taskTypeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  taskTypeName: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
  taskTypeUnit: { fontSize: 13, color: Colors.textMuted },

  addTaskCard: {
    backgroundColor: Colors.bgCard, borderRadius: 14,
    padding: 14, gap: 10, borderWidth: 1, borderColor: Colors.border,
  },
  input: {
    backgroundColor: Colors.bgInput, borderRadius: 10, padding: 14,
    color: Colors.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: Colors.border,
  },
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700' },

  emptyText: { color: Colors.textMuted, fontSize: 13 },

  signOutBtn: {
    borderWidth: 1, borderColor: Colors.danger + '66',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  signOutText: { color: Colors.danger, fontWeight: '700', fontSize: 15 },
});
