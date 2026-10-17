import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Keyboard, Switch } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, spacing, fontSize, fontWeight, touchTarget } from '../lib/theme';
import { isoToDate, toISODate } from '../lib/personHelpers';
import { sendChangeRequest, describeChanges } from '../lib/profile';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import GenderPicker from '../components/GenderPicker';
import CharacterFinder from '../components/CharacterFinder';
import { getTraditions, followsChinese } from '../lib/traditions';

// For changes you aren't allowed to make yourself (someone outside your
// immediate family that you didn't add — see lib/permissions.js): fill in
// what the entry should say, or just write a note (e.g. about their story or
// grave directions), and a family admin approves or rejects it.
export default function RequestChangeScreen({ route, navigation }) {
  const { familyId, personId, about } = route.params; // about: 'story' | 'directions' when opened from those screens
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [person, setPerson] = useState(null);
  const [name, setName] = useState('');
  const [nameCn, setNameCn] = useState('');
  const [chinese, setChinese] = useState(false); // family follows Chinese traditions: show the Chinese name box
  const [birthDate, setBirthDate] = useState(null);
  const [gender, setGender] = useState(null);
  const [isDeceased, setIsDeceased] = useState(false);
  const [deathDate, setDeathDate] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    getTraditions(familyId).then((list) => setChinese(followsChinese(list)));
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
          setIsDeceased(!!data.is_deceased);
          setDeathDate(isoToDate(data.death_date));
        }
        setLoading(false);
      });
  }, [personId, familyId]);

  async function handleSend() {
    const changes = {};
    const currentName = person.name_en || person.name_pinyin || person.name_cn || '';
    if (name.trim() && name.trim() !== currentName) changes.name_en = name.trim();
    // same optional Chinese name as the admins' add/edit form (PersonFormScreen)
    if ((nameCn.trim() || null) !== (person.name_cn || null)) changes.name_cn = nameCn.trim() || null;
    const iso = toISODate(birthDate);
    if (iso !== (person.birth_date || null)) changes.birth_date = iso;
    if ((gender || null) !== (person.gender || null)) changes.gender = gender;
    if (isDeceased !== !!person.is_deceased) changes.is_deceased = isDeceased;
    const deathIso = isDeceased ? toISODate(deathDate) : null;
    if (isDeceased && deathIso !== (person.death_date || null)) changes.death_date = deathIso;

    // a note on its own is fine too (e.g. "the cemetery name is wrong")
    if (Object.keys(changes).length === 0 && !note.trim()) {
      Alert.alert('Nothing to send', 'Change at least one detail, or write a note saying what should change.');
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
    Alert.alert('Request sent', `A family admin will review it:\n\n${[...describeChanges(changes, person), note.trim()].filter(Boolean).join('\n')}`);
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

  const personName = person.name_en || person.name_pinyin || person.name_cn || 'this person';

  return (
    <Screen keyboardAvoiding>
      <Text style={styles.intro}>
        {about
          ? `Write in the note below what should change in ${personName}'s ${about === 'story' ? 'story or photos' : 'grave directions'}. A family admin will look at it.`
          : `Change what ${personName}'s entry should say, or describe it in the note. A family admin will approve or reject it.`}
      </Text>
      <Text style={styles.why}>
        You can change your own immediate family and anything you added yourself. Everything else goes through an admin.
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" />
      {chinese ? (
        <>
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
        </>
      ) : null}
      <DateField label="Birth date" placeholder="Tap to pick a date" value={birthDate} onChange={setBirthDate} />
      <GenderPicker value={gender} onChange={setGender} />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>This person has passed away</Text>
        <Switch
          value={isDeceased}
          onValueChange={setIsDeceased}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.border}
        />
      </View>
      {isDeceased ? (
        <DateField label="Date of passing (optional)" placeholder="Tap to pick a date" value={deathDate} onChange={setDeathDate} />
      ) : null}
      <TextField
        label={about ? 'Note for the admin' : 'Note for the admin (optional)'}
        placeholder="e.g. Their full name, not a nickname"
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
  intro: { color: colors.text, fontSize: fontSize.md, lineHeight: 22, marginBottom: spacing.sm },
  why: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.lg },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: touchTarget, marginBottom: spacing.md },
  switchLabel: { flex: 1, color: colors.text, fontSize: fontSize.md },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
});
