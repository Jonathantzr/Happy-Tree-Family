import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { formatPersonMeta } from '../lib/personHelpers';
import { buildGraph, describeRelation, relationText, siblingIdsOf } from '../lib/relationships';
import Screen from '../components/Screen';
import TextField from '../components/TextField';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';

function personLabel(p) {
  return p.name_en || p.name_pinyin || p.name_cn || '(no name)';
}

// The list of everyone in one family. Tapping a person opens their Person
// screen; the round + button opens the add-a-person form (PersonFormScreen).
export default function FamilyDetailScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [meLinked, setMeLinked] = useState(true); // is your account linked to someone in this family?
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0); // change requests waiting (admins: all, members: yours)
  const [relationships, setRelationships] = useState([]);
  const [selfPersonId, setSelfPersonId] = useState(null);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState({}); // which extended-family sections are unfolded
  // Re-loads every time this screen comes into view (e.g. after someone was
  // added, edited or deleted), not just on first open.
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

    // family links, so the list can be grouped by how people relate to you
    let rels = [];
    if (data.length) {
      const { data: relData } = await supabase
        .from('person_relationships')
        .select('*')
        .in('person_id', data.map((p) => p.id));
      rels = relData || [];
    }
    setRelationships(rels);

    // "add yourself" and change-request reminders at the top of the list
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const me = data.find((p) => p.linked_user_id === user?.id);
    setSelfPersonId(me ? me.id : null);
    setMeLinked(!!me);
    const [{ data: fm }, { data: pending, error: pendingError }] = await Promise.all([
      supabase.from('family_members').select('role').eq('family_id', familyId).eq('user_id', user?.id).maybeSingle(),
      supabase.from('change_requests').select('id').eq('family_id', familyId).eq('status', 'pending'),
    ]);
    setIsAdmin(fm?.role === 'admin');
    setPendingCount(pendingError ? 0 : (pending || []).length);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ---- How the list is arranged ----
  // Once the app knows who you are: your immediate family first (you, your
  // husband/wife, parents, brothers/sisters, children), then everyone else in
  // folded sections — Dad's side, Mum's side, Other relatives. Before that:
  // one A–Z list. Searching always looks through everyone.
  const graph = buildGraph(people, relationships);
  const byName = (a, b) => personLabel(a).localeCompare(personLabel(b));
  const relationOf = {};
  const sections = [];

  if (selfPersonId && graph.byId.has(selfPersonId)) {
    const immediateIds = new Set([
      selfPersonId,
      ...graph.spousesOf(selfPersonId),
      ...graph.parentsOf(selfPersonId),
      ...siblingIdsOf(graph, selfPersonId),
      ...graph.childrenOf(selfPersonId),
    ]);
    const groups = { immediate: [], father: [], mother: [], other: [] };
    for (const p of people) {
      const relation = describeRelation(graph, selfPersonId, p.id);
      relationOf[p.id] = p.id === selfPersonId ? 'You' : relationText(relation);
      const facts = relation?.facts;
      if (immediateIds.has(p.id)) groups.immediate.push(p);
      else if (facts?.kind === 'blood' && facts.up >= 2 && facts.side === 'father') groups.father.push(p);
      else if (facts?.kind === 'blood' && facts.up >= 2 && facts.side === 'mother') groups.mother.push(p);
      else groups.other.push(p);
    }
    // immediate family in a familiar order: you, spouse, parents, siblings, children
    const rank = (p) => {
      if (p.id === selfPersonId) return 0;
      if (graph.spousesOf(selfPersonId).includes(p.id)) return 1;
      if (graph.parentsOf(selfPersonId).includes(p.id)) return 2;
      if (graph.childrenOf(selfPersonId).includes(p.id)) return 4;
      return 3;
    };
    const byAge = (a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999');
    groups.immediate.sort((a, b) => rank(a) - rank(b) || byAge(a, b));
    sections.push({ key: 'immediate', title: 'Your immediate family', people: groups.immediate, foldable: false });
    if (groups.father.length) sections.push({ key: 'father', title: "Dad's side", people: groups.father.sort(byName), foldable: true });
    if (groups.mother.length) sections.push({ key: 'mother', title: "Mum's side", people: groups.mother.sort(byName), foldable: true });
    if (groups.other.length) sections.push({ key: 'other', title: 'Other relatives', people: groups.other.sort(byName), foldable: true });
  } else if (people.length) {
    sections.push({ key: 'all', title: null, people: [...people].sort(byName), foldable: false });
  }

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;
  const found = searching ? people.filter((p) => personLabel(p).toLowerCase().includes(query)).sort(byName) : [];

  const renderRow = (item, index) => (
    <Pressable
      key={item.id}
      style={({ pressed }) => [styles.personRow, index > 0 && styles.rowDivider, pressed && styles.pressed]}
      onPress={() => navigation.navigate('Person', { familyId, familyName, personId: item.id, personName: personLabel(item) })}
      accessibilityRole="button"
    >
      <Avatar name={personLabel(item)} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.personName}>{personLabel(item)}</Text>
        {relationOf[item.id] ? <Text style={styles.personRelation}>{relationOf[item.id]}</Text> : null}
        {formatPersonMeta(item) || item.is_deceased ? (
          <Text style={styles.personMeta}>
            {[formatPersonMeta(item), item.is_deceased && formatPersonMeta(item) !== 'Deceased' ? 'In memory' : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );

  const fab = (
    <Pressable
      onPress={() => navigation.navigate('PersonForm', { familyId, familyName, mode: 'add' })}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Add a person"
    >
      <Ionicons name="add" size={30} color={colors.textOnPrimary} />
    </Pressable>
  );

  return (
    <Screen overlay={fab}>
      {!meLinked ? (
        <Pressable
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Claim', { familyId, familyName })}
          accessibilityRole="button"
        >
          <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Add yourself to this family</Text>
            <Text style={styles.bannerText}>Find your name, or add yourself if you're not here yet.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {pendingCount > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
          onPress={() => navigation.navigate('Requests', { familyId, familyName })}
          accessibilityRole="button"
        >
          <Ionicons name="mail-unread-outline" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {isAdmin
                ? `${pendingCount} change request${pendingCount === 1 ? '' : 's'} to review`
                : `${pendingCount} of your requests ${pendingCount === 1 ? 'is' : 'are'} waiting`}
            </Text>
            <Text style={styles.bannerText}>{isAdmin ? 'Tap to approve or reject.' : 'A family admin will review it soon.'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {people.length === 0 ? (
        <EmptyState icon="person-add-outline" title="No one added yet" message="Tap the + button to add the first person." />
      ) : null}

      {people.length > 6 ? (
        <TextField
          placeholder={`Search ${people.length} people by name`}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
          right={
            search ? (
              <Pressable onPress={() => setSearch('')} style={styles.clearSearch} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            ) : (
              <View style={styles.clearSearch}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
              </View>
            )
          }
        />
      ) : null}

      {searching ? (
        // searching looks through everyone, whichever section they're in
        found.length ? (
          <View style={styles.listCard}>{found.map(renderRow)}</View>
        ) : (
          <Text style={styles.listHint}>No one called "{search.trim()}" in this family.</Text>
        )
      ) : (
        sections.map((section) => {
          const open = !section.foldable || openGroups[section.key];
          return (
            <View key={section.key} style={styles.section}>
              {section.foldable ? (
                <Pressable
                  style={({ pressed }) => [styles.sectionHeader, styles.sectionHeaderFold, pressed && styles.pressed]}
                  onPress={() => setOpenGroups((old) => ({ ...old, [section.key]: !old[section.key] }))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !!open }}
                >
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionCount}>{section.people.length}</Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                </Pressable>
              ) : section.title ? (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
              ) : null}
              {open ? <View style={styles.listCard}>{section.people.map(renderRow)}</View> : null}
            </View>
          );
        })
      )}

      {people.length > 0 && !searching ? <Text style={styles.listHint}>Tap + to add someone new</Text> : null}

      {/* leaves room so the round + button never covers the last row */}
      <View style={{ height: 72 }} />
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
  personRelation: { color: colors.primary, fontSize: fontSize.sm, marginTop: 1 },
  section: { marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionHeaderFold: { minHeight: 48, marginBottom: 0 },
  sectionTitle: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  sectionCount: { color: colors.primaryDark, backgroundColor: colors.primarySoft, fontSize: fontSize.xs, fontWeight: fontWeight.medium, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  clearSearch: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  personMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  memoryTag: { color: colors.primary, fontSize: fontSize.xs, fontStyle: 'italic', marginTop: 2 },
  listHint: { textAlign: 'center', color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  bannerText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2, lineHeight: 19 },
});
