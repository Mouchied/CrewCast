import { useState } from 'react';
import {
  View, Text, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSignup() {
    setError('');
    setSuccess('');
    if (!fullName || !companyName || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:    fullName,
          company_name: companyName,
          industry:     industry || null,
        },
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setSuccess('Account created! Check your email to confirm your address, then sign in.');
    setTimeout(() => router.replace('/(auth)/login'), 4000);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>CrewCast</Text>
          <Text style={styles.tagline}>Start tracking. Start winning.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionLabel}>YOUR INFO</Text>

          <Input
            label="Full name *"
            value={fullName}
            onChangeText={setFullName}
            placeholder="John Smith"
            autoCapitalize="words"
          />

          <Input
            label="Email *"
            value={email}
            onChangeText={setEmail}
            placeholder="john@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password *"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            secureTextEntry
            error={error || undefined}
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>YOUR COMPANY</Text>

          <Input
            label="Company name *"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Smith Electric LLC"
            autoCapitalize="words"
          />

          <Input
            label="Trade / industry"
            value={industry}
            onChangeText={setIndustry}
            placeholder="e.g. electrical, solar, HVAC…"
            autoCapitalize="words"
          />

          {success ? <Text style={styles.successText}>{success}</Text> : null}

          <Button
            label={loading ? 'Creating account…' : 'Create Account'}
            onPress={handleSignup}
            loading={loading}
            style={styles.btnMargin}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/login" style={styles.link}>Sign in</Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 36, fontWeight: '800', color: Colors.primary, letterSpacing: -1 },
  tagline: { color: Colors.textSecondary, marginTop: 6, fontSize: 14 },
  form: { gap: 10 },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: -2,
  },
  btnMargin: { marginTop: 12 },
  successText: { color: '#4caf50', fontSize: 14, textAlign: 'center', backgroundColor: 'rgba(76,175,80,0.1)', padding: 12, borderRadius: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: Colors.textSecondary },
  link: { color: Colors.primary, fontWeight: '600' },
});
