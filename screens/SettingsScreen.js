import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../components/Screen';
import { colors, spacing, fontSize, radius, touchTarget } from '../lib/theme';
import { useTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const { language, setLanguage, t } = useTranslation();

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <Screen>
      <Text style={styles.sectionTitle}>{t('language')}</Text>
      <View style={styles.languageRow}>
        <Pressable
          onPress={() => setLanguage('en')}
          style={[styles.langButton, language === 'en' && styles.langButtonActive]}
        >
          <Text style={language === 'en' ? styles.langTextActive : styles.langText}>English</Text>
        </Pressable>
        <Pressable
          onPress={() => setLanguage('zh')}
          style={[styles.langButton, language === 'zh' && styles.langButtonActive]}
        >
          <Text style={language === 'zh' ? styles.langTextActive : styles.langText}>中文</Text>
        </Pressable>
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  languageRow: { flexDirection: 'row', gap: spacing.sm },
  langButton: { minHeight: touchTarget, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  langButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { color: colors.text, fontSize: fontSize.sm },
  langTextActive: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '600' },
  logoutButton: { marginTop: spacing.xl, minHeight: touchTarget, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.danger },
  logoutText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '600' },
});