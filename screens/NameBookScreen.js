import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import { formatPersonMeta } from '../lib/personHelpers';
import { buildGraph } from '../lib/relationships';
import { loadNameBook, splitPoem, lineGenerations, childIndexOf, usesCharacter, isChinese, guessGenerationName } from '../lib/nameBook';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import CharacterFinder from '../components/CharacterFinder';
import GenerationNameInfo from '../components/GenerationNameInfo';

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(no name)';
}

const BLANK = { pinyin: '', unsure: false, note: '' };

// The family's Generation Name Book (字辈): the naming poem, one character per
// generation, and who in the family belongs to each one. Everyone can read it;
// family admins type the poem in and line it up with the tree.
// Three views on one screen: 'view', 'edit' (the poem) and 'lineup' (pick the
// person whose character is known).
export default function NameBookScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [book, setBook] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfPersonId, setSelfPersonId] = useState(null);
  const [view, setView] = useState('view');
  const [saving, setSaving] = useState(false);

  // edit view
  const [poemText, setPoemText] = useState('');
  const [originNotes, setOriginNotes] = useState('');
  const [details, setDetails] = useState([]); // per position: { char, pinyin, unsure, note }
  const [openRow, setOpenRow] = useState(null);

  // line-up view
  const [pickedPersonId, setPickedPersonId] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const { data: peopleData, error: peopleError } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });
    if (peopleError) {
      setLoadError(peopleError.message);
      setLoading(false);
      return;
    }
    let rels = [];
    if (peopleData.length) {
      const { data: relData } = await supabase
        .from('person_relationships')
        .select('*')
        .in('person_id', peopleData.map((p) => p.id));
      rels = relData || [];
    }
    const found = await loadNameBook(familyId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: fm } = await supabase
      .from('family_members')
      .select('role')
      .eq('family_id', familyId)
      .eq('user_id', user?.id)
      .maybeSingle();

    setPeople(peopleData);
    setRelationships(rels);
    setBook(found.book);
    setEntries(found.entries);
    setLoadError(found.error ? found.error.message : null);
    setIsAdmin(fm?.role === 'admin');
    setSelfPersonId(peopleData.find((p) => p.linked_user_id === user?.id)?.id || null);
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const graph = useMemo(() => buildGraph(people, relationships), [people, relationships]);
  const anchor = book?.anchor_person_id ? graph.byId.get(book.anchor_person_id) : null;
  const linedUp = !!anchor && book.anchor_index != null && book.anchor_index < entries.length;
  const line = useMemo(() => (linedUp ? lineGenerations(graph, book) : new Map()), [linedUp, graph, book]);
  const nameExample = selfPersonId ? guessGenerationName(graph, selfPersonId) : null;

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="The name book could not be opened"
          message={`If this is the first time, the Stage 6 database update may not have been run yet.\n\n(${loadError})`}
        />
        <AppButton title="Try again" variant="secondary" onPress={load} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------
  // Edit view: type the poem, then (optionally) add details per character
  // ------------------------------------------------------------------
  function startEdit() {
    setPoemText(book?.poem_text || entries.map((e) => e.character_cn).join(' '));
    setOriginNotes(book?.origin_notes || '');
    setDetails(
      entries.map((e) => ({ char: e.character_cn, pinyin: e.character_pinyin || '', unsure: e.is_confirmed === false, note: e.notes || '' }))
    );
    setOpenRow(null);
    setView('edit');
  }

  // details only stick to a position while the same character is still there
  const detailFor = (index, char) => (details[index]?.char === char ? details[index] : { char, ...BLANK });
  function setDetail(index, char, patch) {
    setDetails((old) => {
      const next = [...old];
      next[index] = { ...(old[index]?.char === char ? old[index] : { char, ...BLANK }), ...patch };
      return next;
    });
  }

  async function saveBook() {
    const chars = splitPoem(poemText);
    if (chars.length === 0) {
      Alert.alert('Nothing to save yet', 'Type at least one generation name.');
      return;
    }
    setSaving(true);
    const fields = { poem_text: poemText.trim(), origin_notes: originNotes.trim() || null };
    // Families often start with the few names they know and add older or
    // newer ones later, which moves everything along. Keep the line-up on the
    // same name; if that name is gone, the book has to be lined up again.
    if (book?.anchor_index != null) {
      const anchorName = entries.find((e) => e.generation_index === book.anchor_index)?.character_cn;
      if (chars[book.anchor_index] !== anchorName) {
        const movedTo = anchorName ? chars.indexOf(anchorName) : -1;
        fields.anchor_index = movedTo >= 0 ? movedTo : null;
        if (movedTo < 0) fields.anchor_person_id = null;
      }
    }

    const saved = book
      ? await supabase.from('generation_books').update(fields).eq('id', book.id).select()
      : await supabase.from('generation_books').insert({ family_id: familyId, ...fields }).select();
    const bookId = saved.data?.[0]?.id;
    if (saved.error || !bookId) {
      setSaving(false);
      Alert.alert('Could not save the name book', saved.error ? saved.error.message : 'Nothing was saved (only family admins can change the name book).');
      return;
    }

    const rows = chars.map((char, index) => {
      const d = detailFor(index, char);
      return {
        generation_book_id: bookId,
        generation_index: index,
        character_cn: char,
        character_pinyin: d.pinyin.trim() || null,
        is_confirmed: !d.unsure,
        notes: d.note.trim() || null,
      };
    });
    const { error: rowsError } = await supabase.from('generation_entries').upsert(rows, { onConflict: 'generation_book_id,generation_index' });
    const { error: trimError } = rowsError
      ? { error: null }
      : await supabase.from('generation_entries').delete().eq('generation_book_id', bookId).gte('generation_index', chars.length);
    setSaving(false);
    if (rowsError || trimError) {
      Alert.alert('Could not save the characters', (rowsError || trimError).message);
      load();
      return;
    }
    await load();
    setView('view');
  }

  if (view === 'edit') {
    const chars = splitPoem(poemText);
    return (
      <Screen keyboardAvoiding>
        <Text style={styles.heading}>{book ? 'Edit the name book' : 'Add generation names'}</Text>
        <Text style={[styles.intro, { marginBottom: 0 }]}>
          A generation name is the part of a name that everyone in one generation shares. Type one for each generation you know, oldest first —
          not anyone's full name. Write it how it sounds, or use the Chinese character if you know it. More can be added later.
        </Text>
        <GenerationNameInfo example={nameExample} style={{ marginBottom: spacing.sm }} />
        <View style={styles.card}>
          <TextField
            label="Generation names (字辈), oldest first"
            placeholder={"e.g. grandfather's, father's, yours"}
            value={poemText}
            onChangeText={setPoemText}
            multiline
            autoCorrect={false}
            autoCapitalize="words"
          />
          <CharacterFinder onPick={(char) => setPoemText((old) => old + char)} />
          <TextField
            label="Where it came from (optional)"
            placeholder="e.g. Great-grandfather's copy, brought from Fujian"
            value={originNotes}
            onChangeText={setOriginNotes}
            autoCapitalize="sentences"
            returnKeyType="done"
            style={{ marginBottom: 0 }}
          />
        </View>

        {chars.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>
              {chars.length} generation{chars.length === 1 ? '' : 's'}
            </Text>
            <Text style={styles.intro}>Tap a row to add how it is said, a note, or to mark it "not sure".</Text>
            <View style={styles.card0}>
              {chars.map((char, index) => {
                const d = detailFor(index, char);
                const open = openRow === index;
                const summary = [d.pinyin.trim(), d.unsure ? 'Not sure' : null, d.note.trim() ? 'Has a note' : null].filter(Boolean).join(' · ');
                return (
                  <View key={`${index}-${char}`} style={index > 0 && styles.rowDivider}>
                    <Pressable
                      style={({ pressed }) => [styles.editRow, pressed && styles.pressed]}
                      onPress={() => setOpenRow(open ? null : index)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                    >
                      <Text style={styles.editNumber}>{index + 1}</Text>
                      <Text style={styles.editChar}>{char}</Text>
                      <Text style={styles.editSummary}>{summary}</Text>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                    </Pressable>
                    {open ? (
                      <View style={styles.editDetails}>
                        <TextField
                          label="How it is said (optional)"
                          placeholder="e.g. Ming"
                          value={d.pinyin}
                          onChangeText={(text) => setDetail(index, char, { pinyin: text })}
                          autoCorrect={false}
                          autoCapitalize="words"
                          returnKeyType="done"
                        />
                        <View style={styles.switchRow}>
                          <Text style={styles.switchLabel}>Not sure / the family disagrees</Text>
                          <Switch
                            value={d.unsure}
                            onValueChange={(value) => setDetail(index, char, { unsure: value })}
                            trackColor={{ false: colors.border, true: colors.primary }}
                            thumbColor={colors.surface}
                            ios_backgroundColor={colors.border}
                          />
                        </View>
                        <TextField
                          label="Note (optional)"
                          placeholder="e.g. An uncle remembers a different character"
                          value={d.note}
                          onChangeText={(text) => setDetail(index, char, { note: text })}
                          autoCapitalize="sentences"
                          returnKeyType="done"
                          style={{ marginBottom: 0 }}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <AppButton title="Save name book" onPress={saveBook} loading={saving} style={{ marginTop: spacing.lg }} />
        <AppButton title="Cancel" variant="ghost" onPress={() => setView('view')} disabled={saving} style={{ marginTop: spacing.xs }} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------
  // Line-up view: pick one person, then which character is theirs
  // ------------------------------------------------------------------
  function startLineUp() {
    setPickedPersonId(null);
    setSearch('');
    setView('lineup');
  }

  async function saveLineUp(index) {
    setSaving(true);
    const { data, error } = await supabase
      .from('generation_books')
      .update({ anchor_person_id: pickedPersonId, anchor_index: index })
      .eq('id', book.id)
      .select();
    setSaving(false);
    if (error || !data || data.length === 0) {
      Alert.alert('Could not save', error ? error.message : 'Nothing was saved (only family admins can change the name book).');
      return;
    }
    await load();
    setView('view');
  }

  if (view === 'lineup') {
    const picked = pickedPersonId ? graph.byId.get(pickedPersonId) : null;
    if (picked) {
      return (
        <Screen>
          <Text style={styles.heading}>Which character is {personLabel(picked)}'s?</Text>
          <Text style={styles.intro}>
            Tap the generation name that is in {personLabel(picked)}'s name. Everyone else on the father's line is counted from here.
          </Text>
          <View style={styles.charGrid}>
            {entries.map((e) => {
              const inName = usesCharacter(picked, e);
              return (
                <Pressable
                  key={e.id}
                  style={({ pressed }) => [styles.charChoice, inName && styles.charChoiceMatch, pressed && styles.pressed]}
                  onPress={() => saveLineUp(e.generation_index)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Character ${e.generation_index + 1}: ${e.character_cn}`}
                >
                  <Text style={styles.charChoiceText}>{e.character_cn}</Text>
                  <Text style={styles.charChoiceNumber}>{e.generation_index + 1}</Text>
                </Pressable>
              );
            })}
          </View>
          {entries.some((e) => usesCharacter(picked, e)) ? (
            <Text style={styles.intro}>The outlined one is in their name.</Text>
          ) : null}
          <AppButton title="Pick someone else" variant="secondary" onPress={() => setPickedPersonId(null)} disabled={saving} style={{ marginTop: spacing.md }} />
          <AppButton title="Cancel" variant="ghost" onPress={() => setView('view')} disabled={saving} style={{ marginTop: spacing.xs }} />
        </Screen>
      );
    }

    const query = search.trim().toLowerCase();
    const matches = (p) => !query || personLabel(p).toLowerCase().includes(query) || (p.name_cn || '').includes(search.trim());
    const choices = people
      .filter(matches)
      .sort((a, b) => (b.id === selfPersonId) - (a.id === selfPersonId) || personLabel(a).localeCompare(personLabel(b)));
    return (
      <Screen keyboardAvoiding>
        <Text style={styles.heading}>Whose character do you know?</Text>
        <Text style={styles.intro}>
          Pick one person born into the family (not someone who married in) whose generation name you are sure of — for example yourself or your father.
        </Text>
        {people.length > 6 ? (
          <TextField placeholder="Search by name" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        ) : null}
        {choices.length === 0 ? <Text style={styles.intro}>No one called "{search.trim()}" in this family.</Text> : null}
        {choices.length > 0 ? (
          <View style={styles.card0}>
            {choices.map((p, index) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.pickRow, index > 0 && styles.rowDivider, pressed && styles.pressed]}
                onPress={() => setPickedPersonId(p.id)}
                accessibilityRole="button"
              >
                <Avatar name={personLabel(p)} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickName}>
                    {personLabel(p)}
                    {p.id === selfPersonId ? ' (you)' : ''}
                  </Text>
                  {p.name_cn || formatPersonMeta(p) ? (
                    <Text style={styles.pickMeta}>{[p.name_cn, formatPersonMeta(p)].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <AppButton title="Cancel" variant="ghost" onPress={() => setView('view')} style={{ marginTop: spacing.md }} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------
  // Normal view
  // ------------------------------------------------------------------
  if (!book || entries.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="book-outline"
          title="No name book yet"
          message={
            isAdmin
              ? "In many Chinese families, everyone in the same generation shares one part of their name, and the next generation shares a different part. Add the ones your family knows — even two or three — so they aren't forgotten."
              : 'In many Chinese families, everyone in the same generation shares one part of their name, and the next generation shares a different part. A family admin can add them here.'
          }
        />
        <GenerationNameInfo example={nameExample} style={{ alignSelf: 'center', marginBottom: spacing.sm }} />
        {isAdmin ? <AppButton title="Add generation names" icon="create-outline" onPress={startEdit} /> : null}
      </Screen>
    );
  }

  const byAge = (a, b) => (a.birth_date || '9999').localeCompare(b.birth_date || '9999');
  const peopleAt = (index) => people.filter((p) => line.get(p.id) === index).sort(byAge);
  const olderCount = people.filter((p) => line.has(p.id) && line.get(p.id) < 0).length;
  const laterCount = people.filter((p) => line.has(p.id) && line.get(p.id) >= entries.length).length;
  const selfIndex = selfPersonId && line.has(selfPersonId) ? line.get(selfPersonId) : null;
  const selfChildIndex = selfPersonId ? childIndexOf(graph, line, selfPersonId) : null;

  return (
    <Screen>
      <View style={styles.poemCard}>
        <Text style={styles.poemLabel}>{familyName ? `${familyName} · generation names` : 'Generation names'}</Text>
        <Text style={styles.poem}>{book.poem_text || entries.map((e) => e.character_cn).join(' ')}</Text>
        {book.origin_notes ? <Text style={styles.poemOrigin}>{book.origin_notes}</Text> : null}
      </View>
      <GenerationNameInfo example={nameExample} style={{ marginTop: spacing.xs }} />

      {linedUp ? (
        <View style={styles.lineUpCard}>
          <Ionicons name="link-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lineUpTitle}>
              Counted from {personLabel(anchor)} = {entries[book.anchor_index]?.character_cn}
            </Text>
            <Text style={styles.lineUpText}>Follows the father's line. Suggestions only — nothing is added to anyone's name.</Text>
          </View>
          {isAdmin ? (
            <Pressable onPress={startLineUp} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.textButtonText}>Change</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.lineUpCard}>
          <Ionicons name="link-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lineUpTitle}>Not lined up with the family yet</Text>
            <Text style={styles.lineUpText}>
              {isAdmin
                ? 'Tell the app one person\'s character, and it works out everyone else\'s generation.'
                : 'A family admin needs to tell the app one person\'s character first.'}
            </Text>
            {isAdmin ? <AppButton title="Line it up" compact onPress={startLineUp} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }} /> : null}
          </View>
        </View>
      )}

      <Text style={styles.sectionHeading}>Generations</Text>
      {olderCount > 0 ? (
        <Text style={styles.intro}>
          {olderCount} {olderCount === 1 ? 'person is' : 'people are'} from before the first name here — their generation name isn't known yet.
        </Text>
      ) : null}
      <View style={styles.card0}>
        {entries.map((e, rowIndex) => {
          const members = peopleAt(e.generation_index);
          const tags = [
            e.generation_index === selfIndex ? 'Your generation' : null,
            e.generation_index === selfChildIndex ? 'Your children' : null,
          ].filter(Boolean);
          return (
            <View key={e.id} style={[styles.genRow, rowIndex > 0 && styles.rowDivider]}>
              <View style={styles.genCharBox}>
                <Text style={[styles.genChar, !isChinese(e.character_cn) && styles.genSound]}>{e.character_cn}</Text>
                {e.character_pinyin ? <Text style={styles.genPinyin}>{e.character_pinyin}</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                {/* no "Generation 1, 2, 3": a family may only know the middle of its poem */}
                {tags.length || e.is_confirmed === false ? (
                  <View style={styles.genTitleRow}>
                    {tags.map((tag) => (
                      <Text key={tag} style={styles.tag}>{tag}</Text>
                    ))}
                    {e.is_confirmed === false ? <Text style={[styles.tag, styles.tagUnsure]}>Not sure</Text> : null}
                  </View>
                ) : null}
                {e.notes ? <Text style={styles.genNote}>{e.notes}</Text> : null}
                {members.map((p) => {
                  const uses = usesCharacter(p, e);
                  return (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}
                      onPress={() => navigation.navigate('Person', { familyId, familyName, personId: p.id, personName: personLabel(p) })}
                      accessibilityRole="button"
                    >
                      <Text style={styles.memberName}>
                        {personLabel(p)}
                        {p.name_cn ? ` · ${p.name_cn}` : ''}
                      </Text>
                      {uses === true ? <Ionicons name="checkmark-circle" size={18} color={colors.success} accessibilityLabel="Uses this character" /> : null}
                      {uses === false ? <Text style={styles.memberOther}>different name</Text> : null}
                    </Pressable>
                  );
                })}
                {linedUp && members.length === 0 ? <Text style={styles.genEmpty}>No one in the tree yet</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      {laterCount > 0 ? (
        <Text style={[styles.intro, { marginTop: spacing.sm }]}>
          {laterCount} {laterCount === 1 ? 'person comes' : 'people come'} after the last name here — their generation name isn't known yet.
        </Text>
      ) : null}
      {/* the tick is only explained when there is one on the screen */}
      {entries.some((e) => peopleAt(e.generation_index).some((p) => usesCharacter(p, e) === true)) ? (
        <View style={styles.legend}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.legendText}>This person's name includes their generation name.</Text>
        </View>
      ) : null}

      {isAdmin ? (
        <AppButton title="Edit the name book" variant="secondary" icon="create-outline" onPress={startEdit} style={{ marginTop: spacing.md }} />
      ) : (
        <Text style={[styles.intro, { marginTop: spacing.md }]}>Only family admins can change the name book.</Text>
      )}
    </Screen>
  );
}

const card = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card };

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { ...card, padding: spacing.md },
  card0: { ...card },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },

  poemCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center' },
  poemLabel: { color: colors.accent, fontSize: fontSize.xs, fontWeight: fontWeight.medium, textAlign: 'center' },
  poem: { color: colors.textOnPrimary, fontSize: fontSize.xl, lineHeight: 38, letterSpacing: 4, textAlign: 'center', marginTop: spacing.sm },
  poemOrigin: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },

  lineUpCard: { ...card, flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md, marginTop: spacing.md },
  lineUpTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  lineUpText: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: 2 },
  textButton: { minHeight: touchTarget, minWidth: touchTarget, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },

  genRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  genCharBox: { minWidth: 56, alignItems: 'center' },
  genChar: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: fontWeight.medium },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  legendText: { flex: 1, color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  genSound: { fontSize: fontSize.lg },
  genPinyin: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
  genTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs + 2 },
  genTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  tag: { color: colors.primaryDark, backgroundColor: colors.primarySoft, fontSize: fontSize.xs, fontWeight: fontWeight.medium, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  tagUnsure: { backgroundColor: colors.surfaceAlt, color: colors.text },
  genNote: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs },
  genEmpty: { color: colors.placeholder, fontSize: fontSize.sm, marginTop: spacing.xs },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget },
  memberName: { flexShrink: 1, color: colors.primary, fontSize: fontSize.md },
  memberOther: { color: colors.textMuted, fontSize: fontSize.xs },

  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md },
  editNumber: { minWidth: 24, color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'right' },
  editChar: { color: colors.primary, fontSize: fontSize.xl, fontWeight: fontWeight.medium },
  editSummary: { flex: 1, color: colors.textMuted, fontSize: fontSize.sm },
  editDetails: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: touchTarget, marginBottom: spacing.md },
  switchLabel: { flex: 1, color: colors.text, fontSize: fontSize.md },

  charGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  charChoice: { ...card, minWidth: 64, minHeight: 64, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  charChoiceMatch: { borderColor: colors.accent, borderWidth: 2 },
  charChoiceText: { color: colors.primary, fontSize: fontSize.xl, fontWeight: fontWeight.medium },
  charChoiceNumber: { color: colors.textMuted, fontSize: fontSize.xs },

  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  pickName: { color: colors.text, fontSize: fontSize.md },
  pickMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
