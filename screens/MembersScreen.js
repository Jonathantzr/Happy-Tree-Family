import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { askYesNo } from '../lib/personHelpers';
import { loadMembers, setMemberAdmin, removeMember, allowMemberBack, transferOwnership } from '../lib/permissions';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';

const ROLE_WORDS = { owner: 'Owner', admin: 'Admin', member: 'Member' };

// Everyone with an account in this family and what they are (owner, admin,
// member). Everybody can look; only the owner can make or remove admins,
// remove a member, or hand the family on. Rules: lib/permissions.js.
export default function MembersScreen({ route }) {
  const { familyId, familyName } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ members: [], removed: [], myRole: 'member', ready: true });
  const [picked, setPicked] = useState(null); // the member whose options sheet is open

  const load = useCallback(async () => {
    const result = await loadMembers(familyId);
    if (result.error) Alert.alert('Error loading members', result.error.message);
    setData(result);
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // asks first, then runs one of the owner-only actions
  async function run(title, message, action) {
    const member = picked;
    setPicked(null);
    const yes = await askYesNo(title, message);
    if (!yes) return;
    setBusy(true);
    const { error } = await action(member);
    setBusy(false);
    if (error) Alert.alert('Could not do that', error.message);
    load();
  }

  const makeAdmin = () =>
    run('Make an admin?', `${picked.name} will be able to change and delete anyone in ${familyName}, approve requests, edit the Name book and make QR codes.`, (m) =>
      setMemberAdmin(familyId, m.userId, true)
    );
  const removeAdmin = () =>
    run('Remove as admin?', `${picked.name} stays in the family as an ordinary member.`, (m) => setMemberAdmin(familyId, m.userId, false));
  const remove = () =>
    run(
      'Remove from the family?',
      `${picked.name} will no longer see ${familyName}, and the join code will stop working for them. Their entry in the tree stays. You can let them back in later.`,
      (m) => removeMember(familyId, m.userId)
    );
  const handOver = () =>
    run(
      'Make them the owner?',
      `${picked.name} becomes the owner of ${familyName}. You stay an admin, but only ${picked.name} will be able to manage admins and members — or hand it back.`,
      (m) => transferOwnership(familyId, m.userId)
    );

  async function allowBack(person) {
    const yes = await askYesNo('Let them back in?', `${person.name} will be able to join ${familyName} again with the join code.`);
    if (!yes) return;
    setBusy(true);
    const { error } = await allowMemberBack(familyId, person.userId);
    setBusy(false);
    if (error) Alert.alert('Could not do that', error.message);
    load();
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

  const isOwner = data.myRole === 'owner' && data.ready;

  return (
    <Screen>
      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>Who can change what</Text>
        <Text style={styles.rule}>
          <Text style={styles.ruleWord}>Everyone</Text> can add people, and change their own immediate family (themselves, husband or wife, parents,
          children, brothers and sisters) and anything they added themselves. For anyone else they send a request.
        </Text>
        <Text style={styles.rule}>
          <Text style={styles.ruleWord}>Admins</Text> can change or delete anyone, approve requests, edit the Name book and make QR codes.
        </Text>
        <Text style={styles.rule}>
          <Text style={styles.ruleWord}>The owner</Text> is an admin who can also make or remove admins, remove a member, and hand the family on to
          someone else.
        </Text>
      </View>

      {!data.ready ? (
        <Text style={styles.note}>Managing admins needs the Stage 6.5b database update — it has not been run yet.</Text>
      ) : null}

      <Text style={styles.sectionHeading}>
        {data.members.length} {data.members.length === 1 ? 'person has' : 'people have'} joined
      </Text>
      {data.members.length === 0 ? (
        <EmptyState icon="people-outline" title="Nobody here yet" message="People appear here once they join with the family's code." />
      ) : (
        <View style={styles.listCard}>
          {data.members.map((m, index) => {
            const canManage = isOwner && !m.isMe;
            return (
              <Pressable
                key={m.userId}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && canManage && styles.pressed]}
                onPress={canManage ? () => setPicked(m) : undefined}
                disabled={!canManage || busy}
                accessibilityRole={canManage ? 'button' : undefined}
              >
                <Avatar name={m.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {m.name}
                    {m.isMe ? <Text style={styles.you}>  (you)</Text> : null}
                  </Text>
                  {m.personName && m.personName !== m.name ? <Text style={styles.meta}>In the tree as {m.personName}</Text> : null}
                  {!m.personName ? <Text style={styles.meta}>Not linked to anyone in the tree yet</Text> : null}
                </View>
                <Text style={[styles.badge, m.role !== 'member' && styles.badgeStrong]}>{ROLE_WORDS[m.role]}</Text>
                {canManage ? <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {isOwner && data.members.length > 1 ? <Text style={styles.note}>Tap someone to make them an admin or remove them.</Text> : null}
      {!isOwner && data.ready ? <Text style={styles.note}>Only the owner can make admins or remove members.</Text> : null}

      {isOwner && data.removed.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Removed from the family</Text>
          <View style={styles.listCard}>
            {data.removed.map((p, index) => (
              <View key={p.userId} style={[styles.row, index > 0 && styles.rowDivider]}>
                <Avatar name={p.name} size={44} />
                <Text style={[styles.name, { flex: 1 }]}>{p.name}</Text>
                <AppButton title="Let back in" variant="secondary" compact onPress={() => allowBack(p)} disabled={busy} />
              </View>
            ))}
          </View>
          <Text style={styles.note}>The join code does not work for these people.</Text>
        </>
      ) : null}

      <Modal
        visible={!!picked}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPicked(null)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setPicked(null)}>
          <Pressable style={[styles.menuSheet, { paddingBottom: insets.bottom + spacing.sm }]} onPress={() => {}}>
            <Text style={styles.menuTitle} numberOfLines={1}>{picked?.name}</Text>
            {picked?.role === 'member' ? (
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={makeAdmin}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Make an admin</Text>
              </Pressable>
            ) : (
              <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={removeAdmin}>
                <Ionicons name="shield-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>Remove as admin</Text>
              </Pressable>
            )}
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={handOver}>
              <Ionicons name="key-outline" size={20} color={colors.text} />
              <Text style={styles.menuItemText}>Make them the owner</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={remove}>
              <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Remove from the family</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, styles.menuCancel, pressed && styles.pressed]} onPress={() => setPicked(null)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const card = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card };

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pressed: { opacity: 0.6 },
  rulesCard: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  rulesTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  rule: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  ruleWord: { fontWeight: fontWeight.bold },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.lg, marginBottom: spacing.sm },
  note: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  listCard: { ...card },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, minHeight: 68, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.surfaceAlt },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  you: { color: colors.textMuted, fontWeight: fontWeight.regular },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  badge: { color: colors.textMuted, backgroundColor: colors.surfaceAlt, fontSize: fontSize.xs, fontWeight: fontWeight.medium, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeStrong: { color: colors.primaryDark, backgroundColor: colors.accent },
  menuOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.md, paddingHorizontal: spacing.md },
  menuTitle: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.sm },
  menuItemText: { color: colors.text, fontSize: fontSize.md },
  menuItemDanger: { color: colors.danger },
  menuCancel: { justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.surfaceAlt, marginTop: spacing.xs },
  menuCancelText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: fontWeight.medium },
});
