import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!fullName || !companyName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    // Single call — the handle_new_user() DB trigger atomically creates
    // the company and profile from the metadata we pass here.
    // No separate company insert or profile.update needed.
    const { error } = await supabase.auth.signUp({
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

    if (error) {
      Alert.alert('Signup failed', error.message);
      return;
    }

    // Supabase may require email confirmation depending on project settings.
    // If email confirmation is enabled the user has no session yet — show a
    // message instead of navigating. If disabled, the auth listener in
    // useAuth will fire and the AuthGate will redirect automatically.
    Alert.alert(
      'Account created',
      'Check your email to confirm your address, then sign in.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
    );
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

          <Text style={styles.label}>Full name *</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="John Smith"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email *</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="john@company.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password *</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>YOUR COMPANY</Text>

          <Text style={styles.label}>Company name *</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Smith Electric LLC"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Trade / industry</Text>
          <TextInput
            style={styles.input}
            value={industry}
            onChangeText={setIndustry}
            placeholder="e.g. electrical, solar, HVAC…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
          </TouchableOpacity>

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
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: -4 },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    padding: 16,
    color: Colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: Colors.textSecondary },
  link: { color: Colors.primary, fontWeight: '600' },
});
