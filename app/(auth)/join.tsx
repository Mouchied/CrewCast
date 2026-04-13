import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import { Button } from '../../components/Button';

type InviteData = {
  company_name: string;
  role: string;
  email: string;
  status: string;
  expires_at: string;
};

type Phase = 'loading' | 'invalid' | 'ready' | 'accepting' | 'accepted' | 'error';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      setErrorMsg('No invitation token provided.');
      return;
    }
    loadInvite(token);
  }, [token]);

  async function loadInvite(t: string) {
    setPhase('loading');

    const [{ data: sessionData }, { data: rows, error }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.rpc('get_invitation_by_token', { p_token: t }),
    ]);

    if (error || !rows || rows.length === 0) {
      setPhase('invalid');
      setErrorMsg('Invitation not found. It may have expired or been cancelled.');
      return;
    }

    const data = rows[0] as InviteData;

    if (data.status === 'accepted') {
      setPhase('invalid');
      setErrorMsg('This invitation has already been accepted.');
      return;
    }

    if (data.status === 'expired' || new Date(data.expires_at) < new Date()) {
      setPhase('invalid');
      setErrorMsg('This invitation has expired. Ask your team admin to send a new one.');
      return;
    }

    setInvite(data);
    setLoggedIn(!!sessionData?.session);
    setPhase('ready');
  }

  async function handleAccept() {
    if (!token) return;
    setPhase('accepting');

    const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });

    if (error || data?.error) {
      setErrorMsg(error?.message ?? data?.error ?? 'Something went wrong.');
      setPhase('error');
      return;
    }

    setPhase('accepted');
    setTimeout(() => router.replace('/(app)'), 1500);
  }

  function handleSignUp() {
    router.push({ pathname: '/(auth)/signup', params: { token } });
  }

  function handleSignIn() {
    router.push({ pathname: '/(auth)/login', params: { token } });
  }

  const roleLabel = invite?.role
    ? invite.role.charAt(0).toUpperCase() + invite.role.slice(1)
    : '';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>CrewCast</Text>
          <Text style={styles.tagline}>Built by a journeyman, for the trades.</Text>
        </View>

        <View style={styles.card}>
          {phase === 'loading' && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Checking invitation…</Text>
            </View>
          )}

          {phase === 'invalid' && (
            <View style={styles.centered}>
              <Text style={styles.iconText}>✕</Text>
              <Text style={styles.boldTitle}>Invalid Invitation</Text>
              <Text style={styles.bodyText}>{errorMsg}</Text>
              <Button
                label="Back to Sign In"
                onPress={() => router.replace('/(auth)/login')}
                style={styles.btnTop}
              />
            </View>
          )}

          {(phase === 'ready' || phase === 'accepting') && invite && (
            <>
              <Text style={styles.eyebrow}>YOU'VE BEEN INVITED TO</Text>
              <Text style={styles.companyName}>{invite.company_name}</Text>
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{roleLabel}</Text>
              </View>

              {loggedIn ? (
                <>
                  <Text style={styles.bodyText}>
                    Tap below to join this company in CrewCast.
                  </Text>
                  <Button
                    label={phase === 'accepting' ? 'Joining…' : 'Accept Invitation'}
                    onPress={handleAccept}
                    loading={phase === 'accepting'}
                    style={styles.btnTop}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.bodyText}>
                    Create an account or sign in to accept this invitation.
                  </Text>
                  <Button
                    label="Create Account"
                    onPress={handleSignUp}
                    style={styles.btnTop}
                  />
                  <Button
                    label="Sign In"
                    variant="secondary"
                    onPress={handleSignIn}
                    style={styles.btnSecondary}
                  />
                </>
              )}
            </>
          )}

          {phase === 'accepted' && (
            <View style={styles.centered}>
              <Text style={[styles.iconText, { color: Colors.success }]}>✓</Text>
              <Text style={styles.boldTitle}>You're in!</Text>
              <Text style={styles.bodyText}>Taking you to the dashboard…</Text>
            </View>
          )}

          {phase === 'error' && (
            <View style={styles.centered}>
              <Text style={styles.iconText}>✕</Text>
              <Text style={styles.boldTitle}>Something went wrong</Text>
              <Text style={styles.bodyText}>{errorMsg}</Text>
              <Button
                label="Try Again"
                onPress={() => token && loadInvite(String(token))}
                style={styles.btnTop}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 42, fontWeight: '800', color: Colors.primary, letterSpacing: -1 },
  tagline: { color: Colors.textSecondary, marginTop: 8, fontSize: 15 },

  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },

  centered: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  loadingText: { color: Colors.textSecondary, marginTop: 12 },

  iconText: { fontSize: 40, color: Colors.danger, fontWeight: '800' },
  boldTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  bodyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Colors.textMuted,
  },
  companyName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '22',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  roleText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },

  btnTop: { marginTop: 8 },
  btnSecondary: { marginTop: 8 },
});
