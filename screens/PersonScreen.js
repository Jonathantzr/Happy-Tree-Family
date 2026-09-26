import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget } from '../lib/theme';
import Screen from '../components/Screen';
import { formatPersonMeta } from '../lib/personHelpers';

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

export default function PersonScreen({ route, navigation }) {
  const { familyId, familyName, personId } = route.params;

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [grave, setGrave] = useState(null);
  const [stepCount, setStepCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfPersonId, setSelfPersonId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadEverything = useCallback(async () => {
    setLoading(true);

    const { data: peopleData, error: peopleErr } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId);
    if (peopleErr) {
      Alert.alert('Error loading family', peopleErr.message);
      setLoading(false);
      return;
    }
    setPeople(peopleData || []);

    const ids = (peopleData || []).map((p) => p.id);
    if (ids.length) {
      const { data: relData, error: relErr } = await supabase
        .from('person_relationships')
        .select('*')
        .or(`person_id.in.(${ids.join(',')}),related_person_id.in.(${ids.join(',')})`);
      if (relErr) {
        Alert.alert('Error loading relationships', relErr.message);
      } else {
        setRelationships(relData || []);
      }
    }

    const { data: graveData } = await supabase
      .from('graves')
      .select('id, cemetery_name, route_steps(count)')
      .eq('person_id', personId)
      .maybeSingle();
    setGrave(graveData || null);
    setStepCount(graveData?.route_steps?.[0]?.count || 0);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const me = (peopleData || []).find((p) => p.linked_user_id === user.id);
      setSelfPersonId(me ? me.id : null);

      const { data: fm } = await supabase
        .from('family_members')
        .select('role')
        .eq('family_id', familyId)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsAdmin(fm?.role === 'admin');
    }

    setLoading(false);
  }, [familyId, personId]);

  // Re-loads every time this screen comes into focus (e.g. after you edit
  // someone and come back), not just on first open.
  useFocusEffect(
    useCallback(() => {
      loadEverything();
    }, [loadEverything])
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const person = people.find((p) => p.id === personId);
  if (!person) {
    return (
      <Screen>
        <Text style={styles.errorText}>This person could not be found — they may have been deleted.</Text>
      </Screen>
    );
  }

  // ---- small relationship helpers, kept local to this screen on purpose ----
  function parentIdsOf(id) {
    return relationships.filter((r) => r.relation_type === 'parent' && r.person_id === id).map((r) => r.related_person_id);
  }
  function childIdsOf(id) {
    return relationships.filter((r) => r.relation_type === 'parent' && r.related_person_id === id).map((r) => r.person_id);
  }
  function spouseIdsOf(id) {
    return relationships
      .filter((r) => r.relation_type === 'spouse' && (r.person_id === id || r.related_person_id === id))
      .map((r) => (r.person_id === id ? r.related_person_id : r.person_id));
  }
  function siblingIdsOf(id) {
    const myParents = parentIdsOf(id);
    const ids = relationships
      .filter((r) => r.relation_type === 'parent' && myParents.includes(r.related_person_id) && r.person_id !== id)
      .map((r) => r.person_id);
    return [...new Set(ids)];
  }
  function personById(id) {
    return people.find((p) => p.id === id);
  }
  function genderWord(p, ifM, ifF, ifOther) {
    if (p?.gender === 'M') return ifM;
    if (p?.gender === 'F') return ifF;
    return ifOther;
  }

  // Direct relatives of the person on screen, each with a gender-aware label
  const relatives = [];
  const seenRelativeIds = new Set();
  function addRelative(p, label) {
    if (seenRelativeIds.has(p.id)) return;
    seenRelativeIds.add(p.id);
    relatives.push({ person: p, label });
  }
  parentIdsOf(person.id).forEach((id) => {
    const p = personById(id);
    if (p) addRelative(p, genderWord(p, 'Father', 'Mother', 'Parent'));
  });
  spouseIdsOf(person.id).forEach((id) => {
    const p = personById(id);
    if (p) addRelative(p, genderWord(p, 'Husband', 'Wife', 'Spouse'));
  });
  siblingIdsOf(person.id).forEach((id) => {
    const p = personById(id);
    if (p) addRelative(p, genderWord(p, 'Brother', 'Sister', 'Sibling'));
  });
  childIdsOf(person.id).forEach((id) => {
    const p = personById(id);
    if (p) addRelative(p, genderWord(p, 'Son', 'Daughter', 'Child'));
  });

  // How this person relates to whoever is looking at the screen. Covers direct
  // relations, grandparent/grandchild, aunt/uncle/niece/nephew and in-laws;
  // anything further just says "Relative" for now (full multi-generation
  // labels like "great-grandmother" are Stage 5 tree work).
  let relationToViewer = null;
  if (selfPersonId && selfPersonId !== person.id) {
    if (parentIdsOf(selfPersonId).includes(person.id)) relationToViewer = genderWord(person, 'Father', 'Mother', 'Parent');
    else if (childIdsOf(selfPersonId).includes(person.id)) relationToViewer = genderWord(person, 'Son', 'Daughter', 'Child');
    else if (spouseIdsOf(selfPersonId).includes(person.id)) relationToViewer = genderWord(person, 'Husband', 'Wife', 'Spouse');
    else if (siblingIdsOf(selfPersonId).includes(person.id)) relationToViewer = genderWord(person, 'Brother', 'Sister', 'Sibling');
    else {
      const grandparentIds = parentIdsOf(selfPersonId).flatMap((pid) => parentIdsOf(pid));
      const grandchildIds = childIdsOf(selfPersonId).flatMap((cid) => childIdsOf(cid));
      const auntUncleIds = parentIdsOf(selfPersonId).flatMap((pid) => siblingIdsOf(pid));
      const nieceNephewIds = siblingIdsOf(selfPersonId).flatMap((sid) => childIdsOf(sid));
      const inLawParentIds = spouseIdsOf(selfPersonId).flatMap((sp) => parentIdsOf(sp));
      if (grandparentIds.includes(person.id)) relationToViewer = genderWord(person, 'Grandfather', 'Grandmother', 'Grandparent');
      else if (grandchildIds.includes(person.id)) relationToViewer = genderWord(person, 'Grandson', 'Granddaughter', 'Grandchild');
      else if (auntUncleIds.includes(person.id)) relationToViewer = genderWord(person, 'Uncle', 'Aunt', 'Aunt/Uncle');
      else if (nieceNephewIds.includes(person.id)) relationToViewer = genderWord(person, 'Nephew', 'Niece', 'Niece/Nephew');
      else if (inLawParentIds.includes(person.id)) relationToViewer = genderWord(person, 'Father-in-law', 'Mother-in-law', 'Parent-in-law');
      else relationToViewer = 'Relative';
    }
  }

  const canShowGraveActions = person.is_deceased;
  const canShowQR = isAdmin && person.is_deceased;

  async function handleDelete() {
    Alert.alert(
      'Delete this person?',
      `This removes ${personLabel(person)} and their biography, grave and relationship links. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('persons').delete().eq('id', person.id);
            setMenuOpen(false);
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            navigation.goBack();
          },
        },
      ]
    );
  }

  function goAddRelative(kind) {
    setMenuOpen(false);
    navigation.navigate('FamilyDetail', { familyId, familyName, openRelative: { kind, personId: person.id } });
  }

  function goEdit() {
    setMenuOpen(false);
    navigation.navigate('FamilyDetail', { familyId, familyName, openEdit: person.id });
  }

  return (
    <Screen>
      <View style={styles.banner}>
        <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuDots}>⋯</Text>
        </Pressable>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>{personLabel(person).trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
        <Text style={styles.name}>{personLabel(person)}</Text>
        {formatPersonMeta(person) ? <Text style={styles.datePill}>{formatPersonMeta(person)}</Text> : null}
        {person.is_deceased ? <Text style={styles.memoryTag}>In memory</Text> : null}
        {relationToViewer ? (
          <View style={styles.relationPill}>
            <Text style={styles.relationPillText}>{relationToViewer} (relative to you)</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.tileRow}>
        <Pressable
          style={styles.tile}
          onPress={() => navigation.navigate('Biography', { personId: person.id, personName: personLabel(person) })}
        >
          <Text style={styles.tileText}>Story</Text>
        </Pressable>
        {canShowGraveActions && !grave ? (
          <Pressable
            style={styles.tile}
            onPress={() => navigation.navigate('GraveRoute', { personId: person.id, personName: personLabel(person) })}
          >
            <Text style={styles.tileText}>Directions</Text>
          </Pressable>
        ) : null}
        {canShowQR ? (
          <Pressable
            style={styles.tile}
            onPress={() => navigation.navigate('GraveQR', { personId: person.id, personName: personLabel(person) })}
          >
            <Text style={styles.tileText}>QR</Text>
          </Pressable>
        ) : null}
      </View>

      {grave ? (
        <Pressable
          style={styles.graveCard}
          onPress={() => navigation.navigate('GraveRoute', { personId: person.id, personName: personLabel(person) })}
        >
          <Text style={styles.graveCardLabel}>Directions to the grave</Text>          
          <Text style={styles.graveCemetery}>{grave.cemetery_name}</Text>
          <Text style={styles.graveSteps}>
            {stepCount} step{stepCount === 1 ? '' : 's'} from the gate
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionHeading}>Family</Text>
      {relatives.length === 0 ? (
        <Text style={styles.emptyText}>No relatives linked yet.</Text>
      ) : (
        relatives.map(({ person: rp, label }) => (
          <Pressable
            key={rp.id}
            style={styles.relativeRow}
            onPress={() => navigation.push('Person', { familyId, familyName, personId: rp.id, personName: personLabel(rp) })}
          >
            <Text style={styles.relativeName}>{personLabel(rp)}</Text>
            <Text style={styles.relativeLabel}>{label}</Text>
          </Pressable>
        ))
      )}

      <Text style={styles.sectionHeading}>Add a relative</Text>
      <View style={styles.chipRow}>
        {['parent', 'sibling', 'spouse', 'child'].map((k) => (
          <Pressable key={k} style={styles.chip} onPress={() => goAddRelative(k)}>
            <Text style={styles.chipText}>+ {k.charAt(0).toUpperCase() + k.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuBox}>
            <Pressable style={styles.menuItem} onPress={goEdit}>
              <Text style={styles.menuItemText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={handleDelete}>
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.lg, textAlign: 'center' },
  banner: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  menuButton: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  menuDots: { color: colors.textOnPrimary, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  avatarInitial: { color: colors.textOnPrimary, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  name: { color: colors.textOnPrimary, fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center' },
  datePill: { color: colors.textOnPrimary, fontSize: fontSize.sm, marginTop: spacing.xs },
  memoryTag: { color: colors.textOnPrimary, fontSize: fontSize.xs, marginTop: spacing.xs, fontStyle: 'italic' },
  relationPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  relationPillText: { color: colors.primaryDark, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  tileRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tile: { flex: 1, minHeight: touchTarget, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  graveCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md },
  graveCardLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  graveCemetery: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  graveSteps: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: spacing.xs },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptyText: { color: colors.textMuted, fontStyle: 'italic' },
  relativeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touchTarget, borderBottomWidth: 1, borderBottomColor: colors.border },
  relativeName: { color: colors.text, fontSize: fontSize.md },
  relativeLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: touchTarget, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chipText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-start', alignItems: 'flex-end' },
  menuBox: { marginTop: 60, marginRight: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', minWidth: 140 },
  menuItem: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, minHeight: touchTarget, justifyContent: 'center' },
  menuItemText: { color: colors.text, fontSize: fontSize.md },
  menuItemDanger: { color: colors.danger },
});