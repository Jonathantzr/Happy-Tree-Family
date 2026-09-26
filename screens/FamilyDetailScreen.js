import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, Pressable, Switch, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { formatDateDisplay, toISODate, formatPersonMeta, isoToDate, askYesNo } from '../lib/personHelpers';


export default function FamilyDetailScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const [gender, setGender] = useState(null); // 'M' | 'F' | 'other' | null
  const [isDeceased, setIsDeceased] = useState(false);
  const [birthDate, setBirthDate] = useState(null); // JS Date or null
  const [deathDate, setDeathDate] = useState(null);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [showDeathPicker, setShowDeathPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef(null);
  const [relationships, setRelationships] = useState([]);
  // null = adding a plain person. Otherwise { kind: 'edit'|'parent'|'sibling'|'spouse'|'child', person: the card you tapped }
  const [formMode, setFormMode] = useState(null);
  const [pickExisting, setPickExisting] = useState(true);
  const [kbHeight, setKbHeight] = useState(0);
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
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [route.params, people]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    navigation.setOptions({ title: familyName });
    fetchPeople();
  }, []);

  async function fetchPeople() {
    setLoading(true);
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
    setName('');
    setGender(null);
    setIsDeceased(false);
    setBirthDate(null);
    setDeathDate(null);
    setPickExisting(true);
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

  async function linkExisting(other) {
    const kind = formMode.kind;
    const target = formMode.person;
    const row = (child, parent, type = 'parent') => ({ person_id: child, related_person_id: parent, relation_type: type });
    setSaving(true);
    let rows = [];

    if (kind === 'parent') {
      rows = [row(target.id, other.id)];
      for (const spouseId of spouseIdsOf(other.id)) {
        if (spouseId === target.id || parentIdsOf(target.id).includes(spouseId)) continue;
        const yes = await askYesNo(
          'Also link the spouse?',
          `${personLabel(other)} is married to ${labelById(spouseId)}. Is ${labelById(spouseId)} also a parent of ${personLabel(target)}?`
        );
        if (yes) rows.push(row(target.id, spouseId));
      }
    } else if (kind === 'spouse') {
      if (spouseIdsOf(target.id).includes(other.id)) {
        Alert.alert('Already linked', 'These two are already spouses.');
        setSaving(false);
        return;
      }
      rows = [row(target.id, other.id, 'spouse')];
    } else if (kind === 'child') {
      rows = [row(other.id, target.id)];
      for (const spouseId of spouseIdsOf(target.id)) {
        if (spouseId === other.id) continue;
        const yes = await askYesNo('Also link to spouse?', `Is ${labelById(spouseId)} also a parent of ${personLabel(other)}?`);
        if (yes) rows.push(row(other.id, spouseId));
      }
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
    resetForm();
    setSaving(false);
    fetchPeople();
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
      resetForm();
      setSaving(false);
      fetchPeople();
      return;
    }

    // --- ADD a new person (plain, or as a relative) ---
    const target = formMode ? formMode.person : null;

    // For + Child: ask about the spouse BEFORE saving
    const extraParentIds = [];
    if (formMode && formMode.kind === 'child') {
      for (const spouseId of spouseIdsOf(target.id)) {
        const yes = await askYesNo('Also link to spouse?', `Is ${labelById(spouseId)} also a parent of this child?`);
        if (yes) extraParentIds.push(spouseId);
      }
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
        rows = [{ person_id: target.id, related_person_id: newPerson.id, relation_type: 'spouse' }];
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

    resetForm();
    setSaving(false);
    fetchPeople();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView ref={scrollRef} keyboardDismissMode="on-drag" contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + kbHeight }]} keyboardShouldPersistTaps="handled">
          <View style={styles.list}>
            {people.length === 0 ? (
              <Text style={styles.emptyText}>No one added yet — add the first person below.</Text>
            ) : (
              people.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.personRow}
                  onPress={() =>
                    navigation.navigate('Person', {
                      familyId,
                      familyName,
                      personId: item.id,
                      personName: personLabel(item),
                    })
                  }
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitial}>
                      {personLabel(item).trim().charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.personName}>{personLabel(item)}</Text>
                    {formatPersonMeta(item) ? (
                      <Text style={styles.personMeta}>{formatPersonMeta(item)}</Text>
                    ) : null}
                    {item.is_deceased ? <Text style={styles.memoryTag}>In memory</Text> : null}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.form}>
            <Text style={styles.formHeading}>
              {!formMode
                ? 'Add a Person'
                : formMode.kind === 'edit'
                ? `Editing ${personLabel(formMode.person)}`
                : `Add a ${formMode.kind} of ${personLabel(formMode.person)}`}
            </Text>
            {formMode && (
              <Pressable onPress={resetForm}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            )}

            {formMode && formMode.kind === 'edit' && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: '600', marginBottom: 4 }}>Links (tap Remove to undo a mistake)</Text>
                {linksOf(formMode.person.id).length === 0 ? (
                  <Text style={styles.personMeta}>No links yet.</Text>
                ) : (
                  linksOf(formMode.person.id).map((l) => (
                    <View key={l.relId} style={styles.linkRow}>
                      <Text>{l.text}</Text>
                      <Pressable onPress={() => removeLink(l.relId)} style={[styles.smallButton, styles.deleteButton]}>
                        <Text style={styles.deleteText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            )}

            {formMode && formMode.kind !== 'edit' && (
              <View style={{ marginBottom: 10 }}>
                <Pressable onPress={() => setPickExisting(!pickExisting)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>
                    {pickExisting ? 'Tap a name below to link them (tap here to hide)' : 'Show people already added'}
                  </Text>
                </Pressable>
                {pickExisting &&
                  people
                    .filter((p) => p.id !== formMode.person.id)
                    .map((p) => (
                      <Pressable key={p.id} onPress={() => linkExisting(p)} style={styles.pickRow}>
                        <Text>
                          {personLabel(p)}
                          {formatPersonMeta(p) ? `  (${formatPersonMeta(p)})` : ''}
                        </Text>
                      </Pressable>
                    ))}
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <View style={styles.genderRow}>
              {['M', 'F', 'other'].map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(gender === g ? null : g)}
                  style={[styles.genderButton, gender === g && styles.genderButtonSelected]}
                >
                  <Text style={gender === g ? styles.genderTextSelected : styles.genderText}>
                    {g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Other'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text>Deceased</Text>
              <Switch value={isDeceased} onValueChange={setIsDeceased} />
            </View>

            <Pressable style={styles.input} onPress={() => setShowBirthPicker(true)}>
              <Text style={birthDate ? styles.dateText : styles.datePlaceholder}>
                {birthDate ? formatDateDisplay(birthDate) : 'Birth date, optional — tap to pick'}
              </Text>
            </Pressable>
            {showBirthPicker && (
              <DateTimePicker
                value={birthDate || new Date()}
                mode="date"
                display="default"
                maximumDate={new Date()}
                minimumDate={new Date(1500, 0, 1)}
                onChange={(event, selectedDate) => {
                  setShowBirthPicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setBirthDate(selectedDate);
                  }
                }}
              />
            )}

            {isDeceased && (
              <>
                <Pressable style={styles.input} onPress={() => setShowDeathPicker(true)}>
                  <Text style={deathDate ? styles.dateText : styles.datePlaceholder}>
                    {deathDate ? formatDateDisplay(deathDate) : 'Death date, optional — tap to pick'}
                  </Text>
                </Pressable>
                {showDeathPicker && (
                  <DateTimePicker
                    value={deathDate || new Date()}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    minimumDate={new Date(1500, 0, 1)}
                    onChange={(event, selectedDate) => {
                      setShowDeathPicker(false);
                      if (event.type === 'set' && selectedDate) {
                        setDeathDate(selectedDate);
                      }
                    }}
                  />
                )}
              </>
            )}

            <Button
              title={saving ? 'Saving...' : formMode && formMode.kind === 'edit' ? 'Save Changes' : 'Add Person'}
              onPress={handleSave}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  pickRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  personLinks: { fontSize: 12, color: '#555', marginTop: 2 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  smallButton: { borderWidth: 1, borderColor: '#999', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  smallButtonDisabled: { opacity: 0.4 },
  smallButtonText: { fontSize: 12, color: '#333' },
  deleteButton: { borderColor: '#c0392b' },
  deleteText: { fontSize: 12, color: '#c0392b' },
  cancelText: { color: '#c0392b', marginBottom: 10 },
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  list: { marginBottom: 10 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#C9A24B', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 18 },
  memoryTag: { color: '#2F5D4E', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  chevron: { color: '#999', fontSize: 20 },
  personName: { fontSize: 16 },
  personMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  emptyText: { color: '#888', fontStyle: 'italic' },
  form: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 16 },
  formHeading: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, justifyContent: 'center', minHeight: 44 },
  dateText: { color: '#000' },
  datePlaceholder: { color: '#999' },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  genderButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, alignItems: 'center' },
  genderButtonSelected: { backgroundColor: '#333', borderColor: '#333' },
  genderText: { color: '#333' },
  genderTextSelected: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
});