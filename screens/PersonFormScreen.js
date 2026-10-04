import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { toISODate, formatPersonMeta, isoToDate, askYesNo } from '../lib/personHelpers';
import { buildGraph, linkCandidates, siblingIdsOf } from '../lib/relationships';
import { loadNameBook, lineGenerations, childIndexOf, characterAt, characterText } from '../lib/nameBook';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import GenderPicker from '../components/GenderPicker';
import Avatar from '../components/Avatar';
import CharacterFinder from '../components/CharacterFinder';

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

const KIND_WORDS = { parent: 'parent', child: 'child', spouse: 'husband or wife', sibling: 'brother or sister' };

// One screen for adding and editing people, opened from:
// - the family list's + button      -> mode 'add'
// - a Person screen's "+ Parent" etc -> mode 'parent' | 'child' | 'spouse' | 'sibling' (personId = who it's for)
// - a Person screen's "Edit details" -> mode 'edit' (personId = who is being edited)
// The new-person form comes first. For relatives, people already in the
// family can be linked instead — but only those who could actually fit.
export default function PersonFormScreen({ route, navigation }) {
  const { familyId, mode, personId } = route.params;
  const isEdit = mode === 'edit';
  const isRelative = ['parent', 'child', 'spouse', 'sibling'].includes(mode);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [showExisting, setShowExisting] = useState(false);
  const [nameBook, setNameBook] = useState({ book: null, entries: [] });
  const [name, setName] = useState('');
  const [nameCn, setNameCn] = useState('');
  const [gender, setGender] = useState(null);
  const [isDeceased, setIsDeceased] = useState(false);
  const [birthDate, setBirthDate] = useState(null);
  const [deathDate, setDeathDate] = useState(null);
  const [filledFor, setFilledFor] = useState(null); // so edit details are only filled in once

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });
    if (error) {
      Alert.alert('Error loading people', error.message);
      setLoading(false);
      return;
    }
    let rels = [];
    if (data.length) {
      const { data: relData, error: relError } = await supabase
        .from('person_relationships')
        .select('*')
        .in('person_id', data.map((p) => p.id));
      if (relError) Alert.alert('Error loading links', relError.message);
      rels = relData || [];
    }
    setPeople(data);
    setRelationships(rels);
    setNameBook(await loadNameBook(familyId));
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const graph = useMemo(() => buildGraph(people, relationships), [people, relationships]);
  const target = personId ? graph.byId.get(personId) : null;

  // fill in the form when editing
  if (isEdit && target && filledFor !== target.id) {
    setFilledFor(target.id);
    setName(personLabel(target) === '(no name)' ? '' : personLabel(target));
    setNameCn(target.name_en || target.name_pinyin ? target.name_cn || '' : '');
    setGender(target.gender || null);
    setIsDeceased(!!target.is_deceased);
    setBirthDate(isoToDate(target.birth_date));
    setDeathDate(isoToDate(target.death_date));
  }

  const candidates = useMemo(
    () => (isRelative && target ? linkCandidates(graph, target.id, mode) : []),
    [isRelative, target, graph, mode]
  );

  // Name book hint: the generation character for the person being added or
  // edited, when the family's poem reaches them. A suggestion only.
  const nameHint = useMemo(() => {
    if (!target || !nameBook.entries.length) return null;
    const line = lineGenerations(graph, nameBook.book);
    let index = null;
    if (mode === 'child') index = childIndexOf(graph, line, target.id);
    else if (mode === 'edit' || mode === 'sibling') index = line.has(target.id) ? line.get(target.id) : null;
    const found = characterAt(nameBook.entries, index);
    return found.status === 'ok' ? found.entry : null;
  }, [target, nameBook, graph, mode]);

  const labelById = (id) => personLabel(graph.byId.get(id));
  const parentIdsOf = (id) => graph.parentsOf(id);
  const childIdsOf = (id) => graph.childrenOf(id);
  const spouseIdsOf = (id) => graph.spousesOf(id);

  // ---- Auto-linking (see master guide): a normal family is assumed, so the
  // obvious second parent is linked without asking. It only asks when someone
  // has more than one spouse. Mistakes are undone with "Remove" under Family links.

  // Which spouses of parentId should also become parents of childId.
  // alreadyParents = the child's parents not counting parentId.
  async function coParentIds(parentId, childId, childName, alreadyParents) {
    if (alreadyParents.length >= 1) return [];
    const spouses = spouseIdsOf(parentId).filter((s) => s !== childId);
    if (spouses.length === 1) return spouses;
    const picked = [];
    for (const spouseId of spouses) {
      const yes = await askYesNo('Which parent?', `${labelById(parentId)} has more than one spouse. Is ${labelById(spouseId)} a parent of ${childName}?`);
      if (yes) picked.push(spouseId);
    }
    return picked;
  }

  // A new spouse also becomes a parent of children who so far have only one parent.
  async function sharedChildRows(parentId, spouseId, spouseName) {
    const kids = childIdsOf(parentId).filter((kid) => {
      const kidParents = parentIdsOf(kid);
      return !kidParents.includes(spouseId) && kidParents.length < 2;
    });
    if (kids.length === 0) return [];
    let yes = true;
    if (spouseIdsOf(parentId).some((s) => s !== spouseId)) {
      const names = kids.map((kid) => labelById(kid));
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      yes = await askYesNo('Also a parent?', `${labelById(parentId)} has more than one spouse. Is ${spouseName} a parent of ${list}?`);
    }
    return yes ? kids.map((kid) => ({ person_id: kid, related_person_id: spouseId, relation_type: 'parent' })) : [];
  }

  const row = (child, parent, type = 'parent') => ({ person_id: child, related_person_id: parent, relation_type: type });

  // Two parents of the same child are linked as husband and wife as well, so
  // they stand side by side in the tree with ONE line down to the child.
  // Left alone when either of them already has a husband/wife: that's a
  // remarriage, and the app can't know who was married to whom.
  function withCoupleRows(rows) {
    const extra = [];
    const isMarried = (id) =>
      spouseIdsOf(id).length > 0 ||
      [...rows, ...extra].some((r) => r.relation_type === 'spouse' && (r.person_id === id || r.related_person_id === id));
    const newParentRows = rows.filter((r) => r.relation_type === 'parent');
    for (const kid of new Set(newParentRows.map((r) => r.person_id))) {
      const parents = [
        ...new Set([...parentIdsOf(kid), ...newParentRows.filter((r) => r.person_id === kid).map((r) => r.related_person_id)]),
      ];
      if (parents.length !== 2 || isMarried(parents[0]) || isMarried(parents[1])) continue;
      extra.push(row(parents[0], parents[1], 'spouse'));
    }
    return [...rows, ...extra];
  }

  async function makePlaceholderParent() {
    const { data, error } = await supabase
      .from('persons')
      .insert({ family_id: familyId, name_en: `Unknown parent of ${personLabel(target)}`, date_precision: 'unknown' })
      .select()
      .single();
    if (error) {
      Alert.alert('Could not link sibling', error.message);
      return null;
    }
    const { error: linkError } = await supabase.from('person_relationships').insert(row(target.id, data.id));
    if (linkError) Alert.alert('Could not link sibling', linkError.message);
    return data.id;
  }

  async function saveLinks(rows) {
    rows = rows.filter(
      (r) => !relationships.some((x) => x.person_id === r.person_id && x.related_person_id === r.related_person_id && x.relation_type === r.relation_type)
    );
    if (rows.length === 0) return true;
    const { error } = await supabase.from('person_relationships').insert(rows);
    if (error) {
      Alert.alert('Linking failed', error.message);
      return false;
    }
    return true;
  }

  // Link someone already in the family as this relative
  async function linkExisting(other) {
    setSaving(true);
    let rows = [];
    if (mode === 'parent') {
      rows = [row(target.id, other.id)];
      const extra = await coParentIds(other.id, target.id, personLabel(target), parentIdsOf(target.id).filter((p) => p !== other.id));
      extra.forEach((s) => rows.push(row(target.id, s)));
    } else if (mode === 'spouse') {
      rows = [
        row(target.id, other.id, 'spouse'),
        ...(await sharedChildRows(target.id, other.id, personLabel(other))),
        ...(await sharedChildRows(other.id, target.id, personLabel(target))),
      ];
    } else if (mode === 'child') {
      rows = [row(other.id, target.id)];
      const extra = await coParentIds(target.id, other.id, personLabel(other), parentIdsOf(other.id).filter((p) => p !== target.id));
      extra.forEach((s) => rows.push(row(other.id, s)));
    } else if (mode === 'sibling') {
      const targetParents = parentIdsOf(target.id);
      const otherParents = parentIdsOf(other.id);
      if (targetParents.length > 0) rows = targetParents.map((p) => row(other.id, p));
      else if (otherParents.length > 0) rows = otherParents.map((p) => row(target.id, p));
      else {
        const placeholderId = await makePlaceholderParent();
        if (!placeholderId) {
          setSaving(false);
          return;
        }
        rows = [row(other.id, placeholderId)];
      }
    }
    const ok = await saveLinks(withCoupleRows(rows));
    setSaving(false);
    if (ok) navigation.goBack();
  }

  async function removeLink(rel) {
    const other = rel.person_id === target.id ? rel.related_person_id : rel.person_id;
    const yes = await askYesNo('Remove this link?', `${personLabel(target)} and ${labelById(other)} will no longer be linked. Nobody is deleted.`);
    if (!yes) return;
    const { data, error } = await supabase.from('person_relationships').delete().eq('id', rel.id).select();
    if (error || !data || data.length === 0) {
      Alert.alert('Could not remove link', error ? error.message : 'Nothing was removed (a permission rule may be blocking it).');
      return;
    }
    load();
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name needed', 'Please enter a name.');
      return;
    }
    setSaving(true);
    const fields = {
      name_en: name.trim(),
      gender,
      is_deceased: isDeceased,
      birth_date: toISODate(birthDate),
      death_date: isDeceased ? toISODate(deathDate) : null,
      date_precision: birthDate ? 'exact' : 'unknown',
    };
    // only sent when there is something to save, so people can still be added
    // before the Stage 6 database update has been run
    const cn = nameCn.trim() || null;
    if (cn !== ((isEdit ? target.name_cn : null) || null)) fields.name_cn = cn;

    if (isEdit) {
      const { data, error } = await supabase
        .from('persons')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', target.id)
        .select();
      setSaving(false);
      if (error || !data || data.length === 0) {
        Alert.alert('Could not save changes', error ? error.message : 'Nothing was updated (a permission rule may be blocking it).');
        return;
      }
      navigation.goBack();
      return;
    }

    // work out the other parent BEFORE saving a new child (only asks if unclear)
    const extraParentIds = mode === 'child' ? await coParentIds(target.id, null, name.trim(), []) : [];

    const { data: newPerson, error } = await supabase.from('persons').insert({ family_id: familyId, ...fields }).select().single();
    if (error) {
      setSaving(false);
      Alert.alert('Could not add this person', error.message);
      return;
    }

    let rows = [];
    if (mode === 'parent') {
      rows = [row(target.id, newPerson.id)];
    } else if (mode === 'spouse') {
      rows = [row(target.id, newPerson.id, 'spouse'), ...(await sharedChildRows(target.id, newPerson.id, personLabel(newPerson)))];
    } else if (mode === 'child') {
      rows = [target.id, ...extraParentIds].map((pid) => row(newPerson.id, pid));
    } else if (mode === 'sibling') {
      let parentIds = parentIdsOf(target.id);
      if (parentIds.length === 0) {
        const placeholderId = await makePlaceholderParent();
        parentIds = placeholderId ? [placeholderId] : [];
      }
      rows = parentIds.map((pid) => row(newPerson.id, pid));
    }
    rows = withCoupleRows(rows);
    if (rows.length) {
      const { error: linkError } = await supabase.from('person_relationships').insert(rows);
      if (linkError) Alert.alert('Person saved, but linking failed', linkError.message);
    }
    setSaving(false);
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

  if ((isEdit || isRelative) && !target) {
    return (
      <Screen>
        <Text style={styles.intro}>This person could not be found — they may have been deleted.</Text>
      </Screen>
    );
  }

  const heading = isEdit
    ? `Edit ${personLabel(target)}`
    : isRelative
    ? `Add a ${KIND_WORDS[mode]} of ${personLabel(target)}`
    : 'Add a person';

  const links = isEdit ? relationships.filter((r) => r.person_id === target.id || r.related_person_id === target.id) : [];
  const linkWord = (r) => {
    if (r.relation_type === 'spouse') return 'Husband / wife';
    return r.person_id === target.id ? 'Parent' : 'Child';
  };
  const parentsFull = mode === 'parent' && parentIdsOf(target.id).length >= 2;

  return (
    <Screen keyboardAvoiding>
      <Text style={styles.heading}>{heading}</Text>

      {parentsFull ? (
        <Text style={styles.warning}>
          {personLabel(target)} already has two parents linked. To change them, open {personLabel(target)} → ⋯ → Edit details and remove a link first.
        </Text>
      ) : null}

      {/* Someone already in the family? Only people who could actually fit are offered. */}
      {isRelative && candidates.length > 0 && !parentsFull ? (
        <View style={styles.existingCard}>
          <Pressable
            style={({ pressed }) => [styles.existingHeader, pressed && styles.pressed]}
            onPress={() => setShowExisting(!showExisting)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showExisting }}
          >
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.existingTitle}>Already in the family?</Text>
              <Text style={styles.existingText}>
                {candidates.length === 1 ? '1 person could be' : `${candidates.length} people could be`} {personLabel(target)}'s {KIND_WORDS[mode]}
              </Text>
            </View>
            <Ionicons name={showExisting ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
          </Pressable>
          {showExisting
            ? candidates.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => linkExisting(p)}
                  disabled={saving}
                  style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Avatar name={personLabel(p)} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{personLabel(p)}</Text>
                    {formatPersonMeta(p) ? <Text style={styles.pickMeta}>{formatPersonMeta(p)}</Text> : null}
                  </View>
                  <Text style={styles.linkWord}>Link</Text>
                </Pressable>
              ))
            : null}
        </View>
      ) : null}

      {!parentsFull ? (
        <View style={styles.formCard}>
          {isRelative && candidates.length > 0 ? <Text style={styles.formTitle}>Or add someone new</Text> : null}
          <TextField
            label="Name"
            placeholder="Full name or the name the family uses"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
          />
          <TextField
            label="Chinese name (optional)"
            placeholder="e.g. 李文明"
            value={nameCn}
            onChangeText={setNameCn}
            autoCorrect={false}
            returnKeyType="done"
            style={{ marginBottom: spacing.sm }}
          />
          <CharacterFinder suggestFrom={name} onPick={(char) => setNameCn((old) => old + char)} style={nameHint ? { marginBottom: spacing.sm } : null} />
          {nameHint ? (
            <View style={styles.nameHint}>
              <Ionicons name="book-outline" size={18} color={colors.primary} />
              <Text style={styles.nameHintText}>
                Name book: this generation's name is {characterText(nameHint)}. Only a suggestion.
              </Text>
            </View>
          ) : null}
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
          <DateField label="Birth date (optional)" placeholder="Tap to pick a date" value={birthDate} onChange={setBirthDate} />
          {isDeceased ? (
            <DateField label="Date of passing (optional)" placeholder="Tap to pick a date" value={deathDate} onChange={setDeathDate} />
          ) : null}
          <AppButton title={isEdit ? 'Save changes' : 'Add person'} onPress={handleSave} loading={saving} />
          <AppButton title="Cancel" variant="ghost" onPress={() => navigation.goBack()} disabled={saving} style={{ marginTop: spacing.xs }} />
        </View>
      ) : null}

      {isEdit ? (
        <>
          <Text style={styles.sectionHeading}>Family links</Text>
          <View style={styles.formCard}>
            {links.length === 0 ? <Text style={styles.pickMeta}>No links yet.</Text> : null}
            {links.map((r) => {
              const other = r.person_id === target.id ? r.related_person_id : r.person_id;
              return (
                <View key={r.id} style={styles.linkRow}>
                  <Text style={styles.linkText}>
                    {linkWord(r)}: {labelById(other)}
                  </Text>
                  <Pressable onPress={() => removeLink(r)} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]} accessibilityRole="button">
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
            {siblingIdsOf(graph, target.id).length ? (
              <Text style={styles.pickMeta}>Brothers and sisters come from shared parents, so they aren't listed here.</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const card = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card };

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  warning: { color: colors.text, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.sm, lineHeight: 20 },
  existingCard: { ...card, marginBottom: spacing.md },
  existingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 64, paddingHorizontal: spacing.md },
  existingTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  existingText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  pickName: { color: colors.text, fontSize: fontSize.md },
  pickMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  linkWord: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  formCard: { ...card, padding: spacing.md },
  nameHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm + 4, marginBottom: spacing.md },
  nameHintText: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  formTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginBottom: spacing.md },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: touchTarget, marginBottom: spacing.md },
  switchLabel: { flex: 1, color: colors.text, fontSize: fontSize.md },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  linkText: { flex: 1, color: colors.text, fontSize: fontSize.md },
  removeButton: { minHeight: touchTarget, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  removeText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
