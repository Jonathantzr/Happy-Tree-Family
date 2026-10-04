import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { formatPersonMeta, askYesNo } from '../lib/personHelpers';
import {
  getMyProfile,
  claimPerson,
  addMeToFamily,
  matchScore,
  profileDifferences,
  describeChanges,
  sendChangeRequest,
} from '../lib/profile';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import Avatar from '../components/Avatar';

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

// "Which one is you?" — shown after joining a family, or from the family list
// when your account isn't linked to anyone yet. Possible matches (similar
// name, nickname or same birth date) are listed first.
export default function ClaimScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useCallback(async () => {
    const me = await getMyProfile();
    setProfile(me);
    const { data: people, error } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId)
      .is('linked_user_id', null)
      .order('created_at', { ascending: true });
    if (error) Alert.alert('Error loading family', error.message);
    const scored = (people || [])
      .filter((p) => !(p.name_en || '').startsWith('Unknown parent of'))
      .map((p) => ({ person: p, score: matchScore(me, p) }))
      .sort((a, b) => b.score - a.score);
    setCandidates(scored);

    if (me) {
      const { data: fm } = await supabase
        .from('family_members')
        .select('role')
        .eq('family_id', familyId)
        .eq('user_id', me.id)
        .maybeSingle();
      setIsAdmin(fm?.role === 'admin');
    }
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function goToFamily() {
    // back to the family list if we came from it, otherwise open it
    navigation.popTo('FamilyDetail', { familyId, familyName });
  }

  // After linking: if your own details differ from the family's record,
  // admins can update it straight away; members send a request instead.
  async function offerUpdate(person) {
    const changes = profileDifferences(profile, person);
    if (Object.keys(changes).length === 0) return;
    const lines = describeChanges(changes, person).join('\n');
    if (isAdmin) {
      const yes = await askYesNo('Update the family record?', `Your details are different from this family's record:\n\n${lines}\n\nUpdate the record to match?`);
      if (!yes) return;
      const { error } = await supabase.from('persons').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', person.id);
      if (error) Alert.alert('Could not update', error.message);
      return;
    }
    const yes = await askYesNo(
      'Ask to update the record?',
      `Your details are different from this family's record:\n\n${lines}\n\nSend a request to the family admin to update it? (Keep it if the family just uses a nickname for you.)`
    );
    if (!yes) return;
    const { error } = await sendChangeRequest(familyId, person.id, changes, 'Sent when linking my account');
    if (error) Alert.alert('Could not send the request', error.message);
    else Alert.alert('Request sent', 'A family admin will review it.');
  }

  async function pick(person) {
    const meta = formatPersonMeta(person);
    const yes = await askYesNo(
      'Is this you?',
      `${personLabel(person)}${meta ? `\n${meta}` : ''}\n\nWe'll link this entry to your account.`
    );
    if (!yes) return;
    setBusy(true);
    const { error } = await claimPerson(person.id);
    if (error) {
      setBusy(false);
      Alert.alert('Could not link you', error.message);
      return;
    }
    await offerUpdate(person);
    setBusy(false);
    goToFamily();
  }

  async function addMe() {
    if (!profile) {
      Alert.alert('Your details are missing', 'Fill in your details in Settings → Your details first.');
      return;
    }
    const yes = await askYesNo('Add yourself?', `We'll add ${profile.display_name} to ${familyName} and link it to your account.`);
    if (!yes) return;
    setBusy(true);
    const { error } = await addMeToFamily(familyId, profile);
    setBusy(false);
    if (error) {
      Alert.alert('Could not add you', error.message);
      return;
    }
    goToFamily();
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

  const likely = candidates.filter((c) => c.score > 0);
  const others = candidates.filter((c) => c.score === 0);

  const renderRow = ({ person, score }, index) => (
    <Pressable
      key={person.id}
      style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.pressed]}
      onPress={() => pick(person)}
      disabled={busy}
      accessibilityRole="button"
    >
      <Avatar name={personLabel(person)} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{personLabel(person)}</Text>
        {formatPersonMeta(person) ? <Text style={styles.meta}>{formatPersonMeta(person)}</Text> : null}
      </View>
      {score > 0 ? <Text style={styles.matchPill}>Close match</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );

  // The "add me" choice sits at the top, so nobody has to scroll past a long
  // list to find it if they haven't been added yet.
  return (
    <Screen>
      <Text style={styles.heading}>Are you already in {familyName}?</Text>
      <Text style={styles.intro}>
        {candidates.length > 0
          ? 'A relative may have added you already, perhaps under a nickname or a short name. If you see yourself below, tap your name to link it to your account.'
          : "Nobody here is waiting to be linked to an account yet, so let's add you to the family."}
      </Text>

      <View style={[styles.card, styles.addCard]}>
        <Text style={styles.addTitle}>{candidates.length > 0 ? 'Not on the list?' : 'Add yourself'}</Text>
        <Text style={styles.addText}>
          We'll add {profile?.display_name || 'you'} to the family using the details from your account.
        </Text>
        <AppButton title="Add me to the family" icon="person-add-outline" onPress={addMe} loading={busy} />
      </View>

      {likely.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Could this be you?</Text>
          <View style={styles.card}>{likely.map(renderRow)}</View>
        </>
      ) : null}

      {others.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>{likely.length > 0 ? 'Everyone else in the family' : 'People in this family'}</Text>
          <View style={styles.card}>{others.map(renderRow)}</View>
        </>
      ) : null}

      <AppButton title="I'll do this later" variant="ghost" onPress={goToFamily} disabled={busy} style={{ marginTop: spacing.xs }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  heading: { color: colors.text, fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.sm, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  matchPill: { color: colors.primaryDark, backgroundColor: colors.accent, fontSize: fontSize.xs, fontWeight: fontWeight.medium, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  addCard: { padding: spacing.md },
  addTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  addText: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: 2, marginBottom: spacing.md },
});
