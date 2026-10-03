import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import { colors, spacing, fontSize, fontWeight, radius, touchTarget, shadow } from '../lib/theme';
import { useTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export default function SettingsScreen({ navigation }) {
  const { language, setLanguage, t } = useTranslation();
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email || ''));
  }, []);

  function confirmLogout() {
    Alert.alert('Log out?', 'You can log back in any time with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <Screen>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.cardValue}>{email || '…'}</Text>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]}
        onPress={() => navigation.navigate('Profile')}
        accessibilityRole="button"
      >
        <View style={styles.iconCircle}>
          <Ionicons name="id-card-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardValue}>Your details</Text>
          <Text style={styles.cardLabel}>Name, birth date and gender</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <Text style={styles.sectionTitle}>{t('language')}</Text>
      <View style={styles.languageRow}>
        {[
          { code: 'en', label: 'English' },
          { code: 'zh', label: '中文' },
        ].map((option) => {
          const active = language === option.code;
          return (
            <Pressable
              key={option.code}
              onPress={() => setLanguage(option.code)}
              style={[styles.langButton, active && styles.langButtonActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={active ? styles.langTextActive : styles.langText}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>Chinese is on its way — most screens are still in English for now.</Text>

      <AppButton title="Log out" variant="dangerOutline" icon="log-out-outline" onPress={confirmLogout} style={styles.logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  cardValue: { color: colors.text, fontSize: fontSize.md, marginTop: 2 },
  languageRow: { flexDirection: 'row', gap: spacing.sm },
  langButton: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  langButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.text, fontSize: fontSize.md },
  langTextActive: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  note: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm, lineHeight: 18 },
  logout: { marginTop: spacing.xl },
});
