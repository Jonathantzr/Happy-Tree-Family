import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { getTraditionDetails, saveTraditions } from '../lib/traditions';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TraditionPicker from '../components/TraditionPicker';

// Settings that belong to one family (not to your account — those are in the
// Settings tab). For now: which traditions the family follows, which decides
// what the app shows for it. Everyone can look; only family admins can change.
export default function FamilySettingsScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saved, setSaved] = useState({ traditions: [], other: '' });
  const [traditions, setTraditions] = useState([]);
  const [other, setOther] = useState('');

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [details, { data: fm }] = await Promise.all([
      getTraditionDetails(familyId),
      supabase.from('family_members').select('role').eq('family_id', familyId).eq('user_id', user?.id).maybeSingle(),
    ]);
    setSaved(details);
    setTraditions(details.traditions);
    setOther(details.other);
    setIsAdmin(fm?.role === 'admin');
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    setSaving(true);
    const { error } = await saveTraditions(familyId, traditions, other, saved.other);
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    navigation.goBack();
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const changed = [...traditions].sort().join() !== [...saved.traditions].sort().join() || other.trim() !== saved.other.trim();

  return (
    <Screen keyboardAvoiding>
      <Pressable
        style={({ pressed }) => [styles.linkCard, pressed && styles.pressed]}
        onPress={() => navigation.navigate('Members', { familyId, familyName })}
        accessibilityRole="button"
      >
        <Ionicons name="people-outline" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Members and admins</Text>
          <Text style={styles.linkText}>Who has joined, and who can change what.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <TraditionPicker value={traditions} onChange={setTraditions} other={other} onOtherChange={setOther} disabled={!isAdmin} startOpen />
      <Text style={styles.note}>
        Switching one off only hides those parts of the app for this family. Nothing is deleted — switch it back on and everything returns.
      </Text>
      {isAdmin ? (
        <AppButton title="Save" onPress={handleSave} loading={saving} disabled={!changed} />
      ) : (
        <Text style={styles.note}>Only family admins can change this.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 64,
    padding: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  linkTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  linkText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  note: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
});
