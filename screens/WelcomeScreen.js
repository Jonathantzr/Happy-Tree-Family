import { useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Alert, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';

export default function WelcomeScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null); // 'login' | 'signup' | null
  const passwordRef = useRef(null);

  // Returns the cleaned-up email, or null (after showing a message) if something is missing
  function checkInputs() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Email needed', 'Please enter your email address.');
      return null;
    }
    if (!password) {
      Alert.alert('Password needed', 'Please enter your password.');
      return null;
    }
    return cleanEmail;
  }

  async function handleSignUp() {
    const cleanEmail = checkInputs();
    if (!cleanEmail) return;
    if (password.length < 6) {
      Alert.alert('Password too short', 'Please use at least 6 characters.');
      return;
    }
    Keyboard.dismiss();
    setBusy('signup');
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
    setBusy(null);
    if (error) Alert.alert('Could not create account', error.message);
    // If a session came back we're already logged in and the app moves on by itself.
    else if (!data.session) Alert.alert('Almost there', 'Check your email to confirm your account, then log in.');
  }

  async function handleLogIn() {
    const cleanEmail = checkInputs();
    if (!cleanEmail) return;
    Keyboard.dismiss();
    setBusy('login');
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(null);
    if (error) Alert.alert('Could not log in', error.message);
    // On success, RootNavigator notices the new session and shows the app.
  }

  return (
    <Screen safeTop contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <Image source={require('../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>Happy Tree Family</Text>
        <Text style={styles.tagline}>Keep your family's stories — and the way back to them.</Text>
      </View>

      <TextField
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="next"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder="At least 6 characters"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogIn}
        right={
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eye}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </Pressable>
        }
      />

      <AppButton title="Log in" onPress={handleLogIn} loading={busy === 'login'} disabled={busy !== null} style={styles.button} />
      <AppButton
        title="Create an account"
        variant="secondary"
        onPress={handleSignUp}
        loading={busy === 'signup'}
        disabled={busy !== null}
        style={styles.button}
      />
      <Text style={styles.hint}>New here? Type an email and a password, then tap "Create an account".</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 96, height: 96, borderRadius: radius.lg, marginBottom: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center' },
  tagline: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  eye: { width: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  button: { marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
});
