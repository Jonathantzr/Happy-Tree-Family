import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, spacing, fontSize, fontWeight } from '../lib/theme';
import { isoToDate, toISODate } from '../lib/personHelpers';
import { sendChangeRequest, describeChanges } from '../lib/profile';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import GenderPicker from '../components/GenderPicker';
import CharacterFinder from '../components/CharacterFinder';

// For members who want their own entry in the family changed: fill in what
// it should say, and a family admin approves or rejects it.
export default function RequestChangeScreen({ route, navigation }) {
  const { familyId, personId } = route.params;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [person, setPerson] = useState(null);
  const [name, setName] = useState('');
  const [nameCn, setNameCn] = useState('');
  const [birthDate, setBirthDate] = useState(null);
  const [gender, setGender] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    supabase
      .from('persons')
      .select('*')
      .eq('id', personId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPerson(data);
          setName(data.name_en || data.name_pinyin || data.name_cn || '');
          setNameCn(data.name_en || data.name_pinyin ? data.name_cn || '' : '');
          setBirthDate(isoToDate(data.birth_date));
          setGender(data.gender || null);
        }
        setLoading(false);
      });
  }, [personId]);

  async function handleSend() {
    const changes = {};
    const currentName = person.name_en || person.name_pinyin || person.name_cn || '';
    if (name.trim() && name.trim() !== currentName) changes.name_en = name.trim();
    // same optional Chinese name as the admins' add/edit form (PersonFormScreen)
    if ((nameCn.trim() || null) !== (person.name_cn || null)) changes.name_cn = nameCn.trim() || null;
    const iso = toISODate(birthDate);
    if (iso !== (person.birth_date || null)) changes.birth_date = iso;
    if ((gender || null) !== (person.gender || null)) changes.gender = gender;

    if (Object.keys(changes).length === 0) {
      Alert.alert('Nothing changed', 'Change at least one detail before sending.');
      return;
    }
    Keyboard.dismiss();
    setSending(true);
    const { error } = await sendChangeRequest(familyId, personId, changes, note.trim());
    setSending(false);
    if (error) {
      Alert.alert('Could not send the request', error.message);
      return;
    }
    Alert.alert('Request sent', `A family admin will review it:\n\n${describeChanges(changes, person).join('\n')}`);
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

  if (!person) {
    return (
      <Screen>
        <Text style={styles.intro}>This person could not be found.</Text>
      </Screen>
    );
  }

  return (
    <Screen keyboardAvoiding>
      <Text style={styles.intro}>
        Change what you'd like your entry to say. A family admin will approve or reject the change.
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
      <TextField
        label="Chinese name (optional)"
        placeholder="e.g. 李文明"
        value={nameCn}
        onChangeText={setNameCn}
        autoCorrect={false}
        returnKeyType="done"
        style={{ marginBottom: spacing.sm }}
      />
      <CharacterFinder suggestFrom={name} onPick={(char) => setNameCn((old) => old + char)} />
      <DateField label="Birth date" placeholder="Tap to pick a date" value={birthDate} onChange={setBirthDate} />
      <GenderPicker value={gender} onChange={setGender} />
      <TextField
        label="Note for the admin (optional)"
        placeholder="e.g. My full name, not my nickname"
        value={note}
        onChangeText={setNote}
        multiline
      />
      <AppButton title="Send request" icon="paper-plane-outline" onPress={handleSend} loading={sending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.lg },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
});
