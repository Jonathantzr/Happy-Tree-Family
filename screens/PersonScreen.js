import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import { formatPersonMeta, askYesNo } from '../lib/personHelpers';
import { claimPerson, releasePerson } from '../lib/profile';
import { buildGraph, describeRelation, relationText } from '../lib/relationships';

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
  const insets = useSafeAreaInsets();

  const loadEverything = useCallback(async () => {
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
    } else {
      setRelationships([]);
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

  // How this person relates to whoever is looking at the screen, at any
  // distance (e.g. "Your great-grandmother · dad's side") — worked out in
  // lib/relationships.js, the same helper the family tree uses.
  const isMe = person.id === selfPersonId;
  const relationToViewer = isMe
    ? 'This is you'
    : relationText(describeRelation(buildGraph(people, relationships), selfPersonId, person.id));

  // "This is me": only offered when you aren't linked to anyone in this family
  // yet and nobody else is linked to this person.
  const canClaim = !selfPersonId && !person.linked_user_id && !person.is_deceased;

  async function handleClaim() {
    setMenuOpen(false);
    const yes = await askYesNo('Is this you?', `Your account will be linked to ${personLabel(person)} in ${familyName}.`);
    if (!yes) return;
    const { error } = await claimPerson(person.id);
    if (error) Alert.alert('Could not link you', error.message);
    loadEverything();
  }

  async function handleRelease() {
    setMenuOpen(false);
    const yes = await askYesNo('Not you?', `Your account will be unlinked from ${personLabel(person)}. You can link yourself to the right person afterwards.`);
    if (!yes) return;
    const { error } = await releasePerson(person.id);
    if (error) Alert.alert('Could not unlink', error.message);
    loadEverything();
  }

  function goRequestChange() {
    setMenuOpen(false);
    navigation.navigate('RequestChange', { familyId, personId: person.id });
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

  const goTo = (screen) => navigation.navigate(screen, { personId: person.id, personName: personLabel(person) });

  const tiles = [
    { key: 'story', label: 'Story', icon: 'book-outline', onPress: () => goTo('Biography') },
    {
      key: 'tree',
      label: 'Tree',
      icon: 'git-network-outline',
      onPress: () => navigation.navigate('Tree', { familyId, familyName, focusPersonId: person.id }),
    },
  ];
  if (canShowGraveActions && !grave) {
    tiles.push({ key: 'directions', label: 'Add directions', icon: 'map-outline', onPress: () => goTo('GraveRoute') });
  }
  if (canShowQR) {
    tiles.push({ key: 'qr', label: 'QR code', icon: 'qr-code-outline', onPress: () => goTo('GraveQR') });
  }

  return (
    <Screen>
      <View style={styles.banner}>
        <Pressable
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textOnPrimary} />
        </Pressable>
        <Avatar name={personLabel(person)} size={76} />
        <Text style={styles.name}>{personLabel(person)}</Text>
        {formatPersonMeta(person) ? <Text style={styles.datePill}>{formatPersonMeta(person)}</Text> : null}
        {person.is_deceased ? <Text style={styles.memoryTag}>In memory</Text> : null}
        {relationToViewer ? (
          <View style={styles.relationPill}>
            <Text style={styles.relationPillText}>{relationToViewer}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.tileRow}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            onPress={tile.onPress}
            accessibilityRole="button"
          >
            <Ionicons name={tile.icon} size={22} color={colors.primary} />
            <Text style={styles.tileText}>{tile.label}</Text>
          </Pressable>
        ))}
      </View>

      {grave ? (
        <Pressable
          style={({ pressed }) => [styles.graveCard, pressed && styles.pressed]}
          onPress={() => goTo('GraveRoute')}
          accessibilityRole="button"
        >
          <View style={styles.graveIcon}>
            <Ionicons name="map-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.graveCardLabel}>Directions to the grave</Text>
            <Text style={styles.graveCemetery}>{grave.cemetery_name}</Text>
            <Text style={styles.graveSteps}>
              {stepCount === 0 ? 'No steps added yet' : `${stepCount} step${stepCount === 1 ? '' : 's'} from the gate`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}

      <Text style={styles.sectionHeading}>Family</Text>
      {relatives.length === 0 ? (
        <Text style={styles.emptyText}>No relatives linked yet — add one below.</Text>
      ) : (
        <View style={styles.listCard}>
          {relatives.map(({ person: rp, label }, index) => (
            <Pressable
              key={rp.id}
              style={({ pressed }) => [styles.relativeRow, index > 0 && styles.rowDivider, pressed && styles.pressed]}
              onPress={() => navigation.push('Person', { familyId, familyName, personId: rp.id, personName: personLabel(rp) })}
              accessibilityRole="button"
            >
              <Avatar name={personLabel(rp)} size={36} />
              <Text style={styles.relativeName}>{personLabel(rp)}</Text>
              <Text style={styles.relativeLabel}>{label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.sectionHeading}>Add a relative</Text>
      <View style={styles.chipRow}>
        {['parent', 'sibling', 'spouse', 'child'].map((k) => (
          <Pressable
            key={k}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            onPress={() => goAddRelative(k)}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.chipText}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.menuSheet, { paddingBottom: insets.bottom + spacing.sm }]} onPress={() => {}}>
            <Text style={styles.menuTitle} numberOfLines={1}>{personLabel(person)}</Text>
            {isMe && !isAdmin ? (
              // your own entry is kept by the family: members ask an admin to change it
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={goRequestChange}>
                <Ionicons name="paper-plane-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Request a change</Text>
              </Pressable>
            ) : (
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={goEdit}>
                <Ionicons name="create-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Edit details</Text>
              </Pressable>
            )}
            {canClaim ? (
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={handleClaim}>
                <Ionicons name="person-circle-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>This is me</Text>
              </Pressable>
            ) : null}
            {isMe ? (
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={handleRelease}>
                <Ionicons name="unlink-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>This isn't me</Text>
              </Pressable>
            ) : null}
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Delete this person</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, styles.menuCancel, pressed && styles.pressed]}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const card = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  ...shadow.card,
};

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  errorText: { color: colors.textMuted, fontSize: fontSize.md, marginTop: spacing.lg, textAlign: 'center' },
  banner: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center' },
  menuButton: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.textOnPrimary, fontSize: fontSize.xl, fontWeight: fontWeight.bold, textAlign: 'center', marginTop: spacing.sm },
  datePill: { color: colors.textOnPrimary, fontSize: fontSize.sm, marginTop: spacing.xs },
  memoryTag: { color: colors.textOnPrimary, fontSize: fontSize.xs, marginTop: spacing.xs, fontStyle: 'italic' },
  relationPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  relationPillText: { color: colors.primaryDark, fontSize: fontSize.xs, fontWeight: fontWeight.medium },
  tileRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  tile: { ...card, flex: 1, minHeight: 72, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  tileText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium, textAlign: 'center' },
  graveCard: { ...card, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginTop: spacing.md },
  graveIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  graveCardLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: 2 },
  graveCemetery: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  graveSteps: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm },
  listCard: { ...card },
  relativeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  relativeName: { flex: 1, color: colors.text, fontSize: fontSize.md },
  relativeLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: touchTarget, paddingLeft: spacing.sm + 4, paddingRight: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  chipText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.md, paddingHorizontal: spacing.md },
  menuTitle: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.sm },
  menuItemText: { color: colors.text, fontSize: fontSize.md },
  menuItemDanger: { color: colors.danger },
  menuCancel: { justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.surfaceAlt, marginTop: spacing.xs },
  menuCancelText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: fontWeight.medium },
});
