import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { toISODate, formatPersonMeta, isoToDate, askYesNo } from '../lib/personHelpers';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import DateField from '../components/DateField';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';


export default function FamilyDetailScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null); // 'M' | 'F' | 'other' | null
  const [isDeceased, setIsDeceased] = useState(false);
  const [birthDate, setBirthDate] = useState(null); // JS Date or null
  const [deathDate, setDeathDate] = useState(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef(null);
  const [relationships, setRelationships] = useState([]);
  // null = adding a plain person. Otherwise { kind: 'edit'|'parent'|'sibling'|'spouse'|'child', person: the card you tapped }
  const [formMode, setFormMode] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [pickExisting, setPickExisting] = useState(true);
  // true when the form was opened from a Person screen, so closing it goes back there
  const cameFromPerson = useRef(false);
    useEffect(() => {
    if (!route.params) return;
    const { openEdit, openRelative, openDelete } = route.params;
    if (!openEdit && !openRelative && !openDelete) return;
    if (people.length === 0) return; // wait for the list to load first

    if (openEdit) {
      const p = people.find((x) => x.id === openEdit);
      if (p) startEdit(p);
    } else if (openRelative) {
      const p = people.find((x) => x.id === openRelative.personId);
      if (p) startRelative(openRelative.kind, p);
    } else if (openDelete) {
      const p = people.find((x) => x.id === openDelete);
      if (p) confirmDelete(p);
    }

    navigation.setParams({ openEdit: undefined, openRelative: undefined, openDelete: undefined });

    if (openEdit || openRelative) {
      cameFromPerson.current = true;
      setFormVisible(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [route.params, people]);
  // Re-loads every time this screen comes into view (e.g. after someone was
  // edited or deleted on the Person screen), not just on first open.
  useFocusEffect(
    useCallback(() => {
      fetchPeople();
    }, [familyId])
  );

  async function fetchPeople() {
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
    setPeople(data);

    if (data.length > 0) {
      const { data: rels, error: relError } = await supabase
        .from('person_relationships')
        .select('*')
        .in('person_id', data.map((p) => p.id));
      if (relError) {
        Alert.alert('Error loading links', relError.message);
      } else {
        setRelationships(rels);
      }
    } else {
      setRelationships([]);
    }
    setLoading(false);
  }

  function personLabel(p) {
    return p.name_en || p.name_pinyin || p.name_cn || '(no name)';
  }
  function labelById(id) {
    const p = people.find((x) => x.id === id);
    return p ? personLabel(p) : '?';
  }
  // 'parent' rows mean: person_id's parent is related_person_id
  function parentIdsOf(id) {
    return relationships.filter((r) => r.relation_type === 'parent' && r.person_id === id).map((r) => r.related_person_id);
  }
  function childIdsOf(id) {
    return relationships.filter((r) => r.relation_type === 'parent' && r.related_person_id === id).map((r) => r.person_id);
  }
  // spouse rows are stored once, so check both directions
  function spouseIdsOf(id) {
    return relationships
      .filter((r) => r.relation_type === 'spouse' && (r.person_id === id || r.related_person_id === id))
      .map((r) => (r.person_id === id ? r.related_person_id : r.person_id));
  }
  // siblings = anyone (other than yourself) who shares at least one parent
  function siblingIdsOf(id) {
    const myParents = parentIdsOf(id);
    const ids = relationships
      .filter((r) => r.relation_type === 'parent' && myParents.includes(r.related_person_id) && r.person_id !== id)
      .map((r) => r.person_id);
    return [...new Set(ids)];
  }
  function relationSummary(id) {
    const parts = [];
    const parents = parentIdsOf(id);
    const spouses = spouseIdsOf(id);
    const kids = childIdsOf(id);
    if (parents.length) parts.push('Parents: ' + parents.map((x) => labelById(x)).join(', '));
    const sibs = siblingIdsOf(id);
    if (sibs.length) parts.push('Siblings: ' + sibs.map((x) => labelById(x)).join(', '));
    if (spouses.length) parts.push('Spouse: ' + spouses.map((x) => labelById(x)).join(', '));
    if (kids.length) parts.push('Children: ' + kids.map((x) => labelById(x)).join(', '));
    return parts.join('  •  ');
  }

  // every link this person is part of, in plain words (lets you remove mistakes in the Edit form)
  function linksOf(id) {
    return relationships
      .filter((r) => r.person_id === id || r.related_person_id === id)
      .map((r) => {
        const otherId = r.person_id === id ? r.related_person_id : r.person_id;
        let word = 'Spouse';
        if (r.relation_type === 'parent') word = r.person_id === id ? 'Parent' : 'Child';
        return { relId: r.id, text: `${word}: ${labelById(otherId)}` };
      });
  }

  async function removeLink(relId) {
    const { data, error } = await supabase.from('person_relationships').delete().eq('id', relId).select();
    if (error || !data || data.length === 0) {
      Alert.alert('Could not remove link', error ? error.message : 'Nothing was removed (a permission rule may be blocking it).');
      return;
    }
    fetchPeople();
  }

  function resetForm() {
    setFormMode(null);
    setFormVisible(false);
    setName('');
    setGender(null);
    setIsDeceased(false);
    setBirthDate(null);
    setDeathDate(null);
    setPickExisting(true);
  }

  function closeForm() {
    resetForm();
    if (cameFromPerson.current) {
      cameFromPerson.current = false;
      if (navigation.canGoBack()) navigation.goBack();
    }
  }

  function scrollToForm() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }

  function startEdit(item) {
    setFormMode({ kind: 'edit', person: item });
    setName(item.name_en || item.name_pinyin || item.name_cn || '');
    setGender(item.gender || null);
    setIsDeceased(!!item.is_deceased);
    setBirthDate(isoToDate(item.birth_date));
    setDeathDate(isoToDate(item.death_date));
    scrollToForm();
  }

  function startRelative(kind, item) {
    resetForm();
    setFormMode({ kind, person: item });
    scrollToForm();
  }

  function confirmDelete(item) {
    Alert.alert(
      `Delete ${personLabel(item)}?`,
      'This also removes their family links (and any grave or biography attached to them later). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { data, error } = await supabase.from('persons').delete().eq('id', item.id).select();
            if (error || !data || data.length === 0) {
              Alert.alert('Could not delete', error ? error.message : 'Nothing was deleted (a permission rule may be blocking it).');
              return;
            }
            if (formMode && formMode.person.id === item.id) resetForm();
            fetchPeople();
          },
        },
      ]
    );
  }

  // Auto-linking: a normal family is assumed, so the obvious second parent is
  // linked without asking. The app only asks when it genuinely can't tell
  // (someone with more than one spouse). Anything wrong — divorce, adoption,
  // step-children — can be undone with "remove link" in the Edit form.

  // Which spouses of parentId should also become parents of childId.
  // alreadyParents = the child's parents not counting parentId.
  async function coParentIds(parentId, childId, childName, alreadyParents) {
    if (alreadyParents.length >= 1) return []; // already has its other parent
    const spouses = spouseIdsOf(parentId).filter((s) => s !== childId);
    if (spouses.length === 1) return spouses;
    const picked = [];
    for (const spouseId of spouses) {
      const yes = await askYesNo('Which parent?', `${labelById(parentId)} has more than one spouse. Is ${labelById(spouseId)} a parent of ${childName}?`);
      if (yes) picked.push(spouseId);
    }
    return picked;
  }

  // When two people become spouses, the new spouse also becomes a parent of
  // any children who so far have only one parent. Returns the 'parent' links to save.
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

  async function linkExisting(other) {
    const kind = formMode.kind;
    const target = formMode.person;
    const row = (child, parent, type = 'parent') => ({ person_id: child, related_person_id: parent, relation_type: type });

    const isParentOrChild = (a, b) => parentIdsOf(a).includes(b) || parentIdsOf(b).includes(a);

    if (kind === 'spouse' && isParentOrChild(target.id, other.id)) {
      Alert.alert('Cannot link', `${personLabel(other)} is already linked as a parent or child of ${personLabel(target)} — two people can't be both.`);
      return;
    }
    if ((kind === 'parent' || kind === 'child') && spouseIdsOf(target.id).includes(other.id)) {
      Alert.alert('Cannot link', `${personLabel(other)} is already linked as a spouse of ${personLabel(target)} — two people can't be both.`);
      return;
    }

    setSaving(true);
    let rows = [];

    if (kind === 'parent') {
      rows = [row(target.id, other.id)];
      const extra = await coParentIds(other.id, target.id, personLabel(target), parentIdsOf(target.id).filter((p) => p !== other.id));
      extra.forEach((spouseId) => rows.push(row(target.id, spouseId)));
    } else if (kind === 'spouse') {
      if (spouseIdsOf(target.id).includes(other.id)) {
        Alert.alert('Already linked', 'These two are already spouses.');
        setSaving(false);
        return;
      }
      rows = [
        row(target.id, other.id, 'spouse'),
        ...(await sharedChildRows(target.id, other.id, personLabel(other))),
        ...(await sharedChildRows(other.id, target.id, personLabel(target))),
      ];
    } else if (kind === 'child') {
      rows = [row(other.id, target.id)];
      const extra = await coParentIds(target.id, other.id, personLabel(other), parentIdsOf(other.id).filter((p) => p !== target.id));
      extra.forEach((spouseId) => rows.push(row(other.id, spouseId)));
    } else if (kind === 'sibling') {
      const targetParents = parentIdsOf(target.id);
      const otherParents = parentIdsOf(other.id);
      if (targetParents.length > 0) {
        rows = targetParents.map((p) => row(other.id, p));
      } else if (otherParents.length > 0) {
        rows = otherParents.map((p) => row(target.id, p));
      } else {
        const { data: ph, error: phError } = await supabase
          .from('persons')
          .insert({ family_id: familyId, name_en: `Unknown parent of ${personLabel(target)}`, date_precision: 'unknown' })
          .select()
          .single();
        if (phError) {
          Alert.alert('Could not link sibling', phError.message);
          setSaving(false);
          return;
        }
        rows = [row(target.id, ph.id), row(other.id, ph.id)];
      }
    }

    // skip links that already exist
    rows = rows.filter(
      (r) => !relationships.some((x) => x.person_id === r.person_id && x.related_person_id === r.related_person_id && x.relation_type === r.relation_type)
    );
    if (rows.length === 0) {
      Alert.alert('Already linked', 'These two are already linked that way.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('person_relationships').insert(rows);
    if (error) Alert.alert('Linking failed', error.message);
    setSaving(false);
    fetchPeople();
    closeForm();
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name.');
      return;
    }
    setSaving(true);

    const fields = {
      name_en: name.trim(),
      gender: gender,
      is_deceased: isDeceased,
      birth_date: toISODate(birthDate),
      death_date: isDeceased ? toISODate(deathDate) : null,
      date_precision: birthDate ? 'exact' : 'unknown',
    };

    // --- EDIT an existing person ---
    if (formMode && formMode.kind === 'edit') {
      const { data, error } = await supabase
        .from('persons')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', formMode.person.id)
        .select();
      if (error || !data || data.length === 0) {
        Alert.alert('Could not save changes', error ? error.message : 'Nothing was updated (a permission rule may be blocking it).');
        setSaving(false);
        return;
      }
      setSaving(false);
      fetchPeople();
      closeForm();
      return;
    }

    // --- ADD a new person (plain, or as a relative) ---
    const target = formMode ? formMode.person : null;

    // For + Child: work out the other parent BEFORE saving (only asks if unclear)
    let extraParentIds = [];
    if (formMode && formMode.kind === 'child') {
      extraParentIds = await coParentIds(target.id, null, name.trim(), []);
    }

    const { data: newPerson, error } = await supabase
      .from('persons')
      .insert({ family_id: familyId, ...fields })
      .select()
      .single();

    if (error) {
      Alert.alert('Error adding person', error.message);
      setSaving(false);
      return;
    }

    if (formMode) {
      const kind = formMode.kind;
      let rows = [];
      if (kind === 'parent') {
        rows = [{ person_id: target.id, related_person_id: newPerson.id, relation_type: 'parent' }];
      } else if (kind === 'spouse') {
        rows = [
          { person_id: target.id, related_person_id: newPerson.id, relation_type: 'spouse' },
          ...(await sharedChildRows(target.id, newPerson.id, personLabel(newPerson))),
        ];
      } else if (kind === 'child') {
        rows = [target.id, ...extraParentIds].map((pid) => ({ person_id: newPerson.id, related_person_id: pid, relation_type: 'parent' }));
      } else if (kind === 'sibling') {
        let parentIds = parentIdsOf(target.id);
        if (parentIds.length === 0) {
          // No parent yet: make a placeholder parent so the two are still linked as siblings
          const { data: placeholder, error: phError } = await supabase
            .from('persons')
            .insert({ family_id: familyId, name_en: `Unknown parent of ${personLabel(target)}`, date_precision: 'unknown' })
            .select()
            .single();
          if (phError) {
            Alert.alert('Could not link sibling', phError.message);
            resetForm();
            setSaving(false);
            fetchPeople();
            return;
          }
          await supabase
            .from('person_relationships')
            .insert({ person_id: target.id, related_person_id: placeholder.id, relation_type: 'parent' });
          parentIds = [placeholder.id];
        }
        rows = parentIds.map((pid) => ({ person_id: newPerson.id, related_person_id: pid, relation_type: 'parent' }));
      }
      const { error: linkError } = await supabase.from('person_relationships').insert(rows);
      if (linkError) {
        Alert.alert('Person saved, but linking failed', linkError.message);
      }
    }

    setSaving(false);
    fetchPeople();
    closeForm();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const fab = !formVisible ? (
    <Pressable
      onPress={() => {
        setFormMode(null);
        setFormVisible(true);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
      }}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Add a person"
    >
      <Ionicons name="add" size={30} color={colors.textOnPrimary} />
    </Pressable>
  ) : null;

  const isEdit = formMode && formMode.kind === 'edit';
  const isRelative = formMode && formMode.kind !== 'edit';
  const pickablePeople = isRelative ? people.filter((p) => p.id !== formMode.person.id) : [];

  return (
    <Screen scrollRef={scrollRef} overlay={fab}>
      {people.length === 0 ? (
        !formVisible && (
          <EmptyState
            icon="person-add-outline"
            title="No one added yet"
            message="Tap the + button to add the first person — starting with yourself works well."
          />
        )
      ) : (
        <View style={styles.listCard}>
          {people.map((item, index) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.personRow, index > 0 && styles.rowDivider, pressed && styles.pressed]}
              onPress={() =>
                navigation.navigate('Person', {
                  familyId,
                  familyName,
                  personId: item.id,
                  personName: personLabel(item),
                })
              }
              accessibilityRole="button"
            >
              <Avatar name={personLabel(item)} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{personLabel(item)}</Text>
                {formatPersonMeta(item) ? (
                  <Text style={styles.personMeta}>{formatPersonMeta(item)}</Text>
                ) : null}
                {item.is_deceased ? <Text style={styles.memoryTag}>In memory</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {people.length > 0 && !formVisible && (
        <Text style={styles.listHint}>That's everyone so far — tap + to add more</Text>
      )}

      {formVisible && (
        <View style={styles.formCard}>
          <Text style={styles.formHeading}>
            {!formMode
              ? 'Add a person'
              : isEdit
              ? `Editing ${personLabel(formMode.person)}`
              : `Add a ${formMode.kind} of ${personLabel(formMode.person)}`}
          </Text>

          {isEdit && (
            <View style={styles.formSection}>
              <Text style={styles.fieldLabel}>Family links</Text>
              {linksOf(formMode.person.id).length === 0 ? (
                <Text style={styles.personMeta}>No links yet.</Text>
              ) : (
                linksOf(formMode.person.id).map((l) => (
                  <View key={l.relId} style={styles.linkRow}>
                    <Text style={styles.linkText}>{l.text}</Text>
                    <Pressable
                      onPress={() => removeLink(l.relId)}
                      style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          )}

          {isRelative && (
            <View style={styles.formSection}>
              <AppButton
                variant="secondary"
                compact
                icon={pickExisting ? 'person-add-outline' : 'people-outline'}
                title={pickExisting ? "They're not in the list — add a new person" : 'Pick someone already in the family'}
                onPress={() => setPickExisting(!pickExisting)}
              />
              {pickExisting && (
                <>
                  <Text style={styles.pickHint}>
                    {pickablePeople.length > 0
                      ? 'Already in the family? Tap their name to link them:'
                      : 'No one else is in this family yet — add them as a new person below.'}
                  </Text>
                  {pickablePeople.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => linkExisting(p)}
                      disabled={saving}
                      style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
                      accessibilityRole="button"
                    >
                      <Avatar name={personLabel(p)} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkText}>{personLabel(p)}</Text>
                        {formatPersonMeta(p) ? <Text style={styles.personMeta}>{formatPersonMeta(p)}</Text> : null}
                      </View>
                      <Ionicons name="link-outline" size={18} color={colors.primary} />
                    </Pressable>
                  ))}
                  {pickablePeople.length > 0 && <Text style={styles.orText}>Or add them as a new person:</Text>}
                </>
              )}
            </View>
          )}

          <TextField
            label="Name"
            placeholder="Full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.genderRow}>
            {['M', 'F', 'other'].map((g) => (
              <Pressable
                key={g}
                onPress={() => setGender(gender === g ? null : g)}
                style={[styles.genderButton, gender === g && styles.genderButtonSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === g }}
              >
                <Text style={gender === g ? styles.genderTextSelected : styles.genderText}>
                  {g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Other'}
                </Text>
              </Pressable>
            ))}
          </View>

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

          <DateField
            label="Birth date (optional)"
            placeholder="Tap to pick a date"
            value={birthDate}
            onChange={setBirthDate}
          />
          {isDeceased && (
            <DateField
              label="Date of passing (optional)"
              placeholder="Tap to pick a date"
              value={deathDate}
              onChange={setDeathDate}
            />
          )}

          <AppButton
            title={isEdit ? 'Save changes' : 'Add person'}
            onPress={handleSave}
            loading={saving}
          />
          <AppButton title="Cancel" variant="ghost" onPress={closeForm} disabled={saving} style={{ marginTop: spacing.xs }} />
        </View>
      )}

      {/* leaves room so the round + button never covers the last row */}
      {!formVisible && <View style={{ height: 72 }} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  pressed: { opacity: 0.6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md - 4, paddingHorizontal: spacing.md, minHeight: 72 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  personName: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  personMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  memoryTag: { color: colors.primary, fontSize: fontSize.xs, fontStyle: 'italic', marginTop: 2 },
  listHint: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md },
  formCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  formHeading: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md },
  formSection: { marginBottom: spacing.md },
  fieldLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: spacing.xs + 2 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  linkText: { flex: 1, color: colors.text, fontSize: fontSize.md },
  removeButton: { minHeight: touchTarget, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  removeText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  pickHint: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  orText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.md },
  genderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  genderButton: { flex: 1, minHeight: touchTarget, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  genderButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  genderText: { color: colors.text, fontSize: fontSize.sm },
  genderTextSelected: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: touchTarget, marginBottom: spacing.md },
  switchLabel: { flex: 1, color: colors.text, fontSize: fontSize.md },
});
