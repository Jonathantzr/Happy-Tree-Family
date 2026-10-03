import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, spacing, fontSize, fontWeight } from '../lib/theme';
import { getMyProfile, saveMyProfile } from '../lib/profile';
import { isoToDate } from '../lib/personHelpers';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import GenderPicker from '../components/GenderPicker';

// Your own details. Two uses:
// - setup: shown once right after signing up (onSaved is passed in by RootNavigator)
// - edit: opened from Settings -> "Your details"
export default function ProfileScreen({ navigation, onSaved }) {
  const isSetup = !!onSaved;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState(null);
  const [gender, setGender] = useState(null);

  useEffect(() => {
    getMyProfile().then((profile) => {
      if (profile) {
        // the sign-up trigger may have filled the name with the email address — don't show that
        setName(profile.display_name && !profile.display_name.includes('@') ? profile.display_name : '');
        setBirthDate(isoToDate(profile.birth_date));
        setGender(profile.gender || null);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name needed', 'Please enter your name.');
      return;
    }
    if (!birthDate) {
      Alert.alert('Birth date needed', 'Your birth date helps your family find you in the family tree.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    const { error } = await saveMyProfile({ name, birthDate, gender });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    if (isSetup) onSaved();
    else {
      Alert.alert(
        'Saved',
        "Your account details are updated. Your entry in each family's tree is kept by the family — to change it there, open yourself in the family and choose \"Request a change\"."
      );
      navigation.goBack();
    }
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

  return (
    <Screen>
      <Text style={styles.heading}>{isSetup ? 'Tell us about you' : 'Your details'}</Text>
      <Text style={styles.intro}>
        {isSetup
          ? "This helps your family find you in the family tree when you join, and lets the app show how everyone is related to you."
          : 'These are the details on your account.'}
      </Text>

      <TextField
        label="Your name"
        placeholder="e.g. Tan Zhi Ren"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        returnKeyType="done"
      />
      <DateField label="Birth date" placeholder="Tap to pick a date" value={birthDate} onChange={setBirthDate} />
      <GenderPicker value={gender} onChange={setGender} />

      <AppButton title={isSetup ? 'Continue' : 'Save'} onPress={handleSave} loading={saving} />
      {isSetup ? (
        <AppButton
          title="Log out"
          variant="ghost"
          onPress={() => supabase.auth.signOut()}
          disabled={saving}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.lg },
});
