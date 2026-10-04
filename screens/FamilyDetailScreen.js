import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { formatPersonMeta } from '../lib/personHelpers';
import Screen from '../components/Screen';
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

    // "add yourself" and change-request reminders at the top of the list
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMeLinked(data.some((p) => p.linked_user_id === user?.id));
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
                {formatPersonMeta(item) ? <Text style={styles.personMeta}>{formatPersonMeta(item)}</Text> : null}
                {item.is_deceased ? <Text style={styles.memoryTag}>In memory</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {people.length > 0 ? <Text style={styles.listHint}>That's everyone so far — tap + to add more</Text> : null}

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
