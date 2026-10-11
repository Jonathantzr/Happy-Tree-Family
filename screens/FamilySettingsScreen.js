import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors, spacing, fontSize } from '../lib/theme';
import { getTraditionDetails, saveTraditions } from '../lib/traditions';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TraditionPicker from '../components/TraditionPicker';

// Settings that belong to one family (not to your account — those are in the
// Settings tab). For now: which traditions the family follows, which decides
// what the app shows for it. Everyone can look; only family admins can change.
export default function FamilySettingsScreen({ route, navigation }) {
  const { familyId } = route.params;
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
  note: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
});
