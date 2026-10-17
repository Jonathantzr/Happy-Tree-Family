import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { loadRecentChanges, undoSave, timeAgo, getChangesSeenAt, markChangesSeen } from '../lib/changeLog';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import EmptyState from '../components/EmptyState';

// Family admins only: every change to people, links, stories and grave
// directions, newest first, each with an Undo button. Catches spiteful or
// mistaken edits that people are allowed to make in their own immediate family.
export default function RecentChangesScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [result, setResult] = useState({ saves: [], ready: true });
  const [busyBatch, setBusyBatch] = useState(null);
  const seenAtRef = useRef(undefined); // undefined = not read yet; null = never looked before

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data: fm }, { data: people }] = await Promise.all([
      supabase.from('family_members').select('role').eq('family_id', familyId).eq('user_id', user?.id).maybeSingle(),
      supabase.from('persons').select('id, name_en, name_pinyin, name_cn').eq('family_id', familyId),
    ]);
    setIsAdmin(fm?.role === 'admin');
    // "new" is measured from when you last looked BEFORE opening this screen,
    // and stays that way while you're here (even after Open → back), so the
    // highlighted ones don't vanish under your finger
    if (seenAtRef.current === undefined) seenAtRef.current = await getChangesSeenAt(familyId);
    setResult(await loadRecentChanges(familyId, people || [], seenAtRef.current));
    setLoading(false);
    if (fm?.role === 'admin') markChangesSeen(familyId); // clears the red number
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function confirmUndo(save) {
    Alert.alert('Undo this change?', `${save.title}\n\n${save.warning}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          setBusyBatch(save.batch);
          const { error } = await undoSave(familyId, save.batch);
          setBusyBatch(null);
          if (error) Alert.alert('Could not undo', error.message);
          load();
        },
      },
    ]);
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

  if (!isAdmin) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title="For family admins" message="Only family admins can see and undo recent changes." />
      </Screen>
    );
  }

  if (!result.ready) {
    return (
      <Screen>
        <EmptyState
          icon="construct-outline"
          title="Not switched on yet"
          message="Recent changes needs the Stage 6.5c database update (supabase/stage6_5c-recent-changes.sql)."
        />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <Text style={styles.intro}>
        Every change to people, links, stories and grave directions in {familyName}, newest first. Undo puts things back exactly as they were before
        that change.
      </Text>

      {result.saves.length === 0 ? (
        <EmptyState icon="time-outline" title="No changes yet" message="Changes made from now on will show up here." />
      ) : (
        result.saves.map((save, index) => (
          <View key={save.batch}>
          {/* new ones (by other people, since you last looked) sit at the top in a
              highlighted colour; a label marks where the already-seen ones start */}
          {save.isNew && index === 0 ? <Text style={styles.groupLabel}>New since you last looked</Text> : null}
          {!save.isNew && index > 0 && result.saves[index - 1].isNew ? <Text style={styles.groupLabel}>Seen before</Text> : null}
          <View style={[styles.card, save.isNew && styles.cardNew, save.undone && styles.cardUndone]}>
            {save.isNew ? <View style={styles.newDot} accessibilityLabel="New" /> : null}
            <Text style={[styles.title, save.undone && styles.undoneText]}>{save.title}</Text>
            {save.lines.map((line, i) => (
              <Text key={i} style={[styles.line, save.undone && styles.undoneText]}>
                {line}
              </Text>
            ))}
            <Text style={styles.meta}>
              {timeAgo(save.when)}
            </Text>
            <View style={styles.actions}>
              {save.undone ? (
                <Text style={styles.undoneTag}>Undone by {save.undoneBy}</Text>
              ) : (
                <AppButton
                  title="Undo"
                  icon="arrow-undo-outline"
                  variant="dangerOutline"
                  compact
                  onPress={() => confirmUndo(save)}
                  loading={busyBatch === save.batch}
                  disabled={busyBatch !== null}
                />
              )}
              {save.personId ? (
                <AppButton
                  title="Open"
                  variant="ghost"
                  compact
                  onPress={() => navigation.navigate('Person', { familyId, familyName, personId: save.personId, personName: save.personName })}
                />
              ) : null}
            </View>
          </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm + 4, ...shadow.card },
  cardNew: { backgroundColor: colors.primarySoft, borderColor: colors.primary, paddingRight: spacing.lg + 4 },
  newDot: { position: 'absolute', top: spacing.md, right: spacing.md, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  groupLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xs, marginBottom: spacing.sm },
  cardUndone: { backgroundColor: colors.background },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium, lineHeight: 22 },
  line: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20, marginTop: 2 },
  undoneText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  undoneTag: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic', minHeight: 48, textAlignVertical: 'center', paddingVertical: 14 },
});
