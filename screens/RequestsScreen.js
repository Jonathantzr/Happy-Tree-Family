import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, shadow } from '../lib/theme';
import { describeChanges } from '../lib/profile';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import EmptyState from '../components/EmptyState';

function personLabel(p) {
  return p?.name_en || p?.name_pinyin || p?.name_cn || '(deleted person)';
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const STATUS_WORDS = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' };

// Change requests for one family. Admins see everyone's and can approve or
// reject; members see the ones they sent and whether they were approved.
export default function RequestsScreen({ route }) {
  const { familyId } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: fm } = await supabase
      .from('family_members')
      .select('role')
      .eq('family_id', familyId)
      .eq('user_id', user?.id)
      .maybeSingle();
    setIsAdmin(fm?.role === 'admin');

    const { data, error } = await supabase
      .from('change_requests')
      .select('*, persons(name_en, name_pinyin, name_cn, gender, birth_date), requester:users!change_requests_requested_by_fkey(display_name)')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) Alert.alert('Error loading requests', error.message);
    setRequests(data || []);
    setLoading(false);
  }, [familyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function review(request, approve) {
    setBusyId(request.id);
    const { error } = await supabase.rpc('review_change_request', { p_request_id: request.id, p_approve: approve });
    setBusyId(null);
    if (error) {
      Alert.alert('Could not update the request', error.message);
      return;
    }
    load();
  }

  function confirmReview(request, approve) {
    const who = personLabel(request.persons);
    Alert.alert(approve ? 'Approve this change?' : 'Reject this change?', approve ? `${who}'s entry will be updated.` : `${who}'s entry stays as it is.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: approve ? 'Approve' : 'Reject', style: approve ? 'default' : 'destructive', onPress: () => review(request, approve) },
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

  const pending = requests.filter((r) => r.status === 'pending');
  const done = requests.filter((r) => r.status !== 'pending');

  const renderCard = (r) => (
    <View key={r.id} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.personName}>{personLabel(r.persons)}</Text>
        <Text style={[styles.status, styles[`status_${r.status}`]]}>{STATUS_WORDS[r.status]}</Text>
      </View>
      <Text style={styles.meta}>
        From {r.requester?.display_name || 'a family member'} · {shortDate(r.created_at)}
      </Text>
      {describeChanges(r.changes || {}, r.persons).map((line) => (
        <Text key={line} style={styles.change}>
          {line}
        </Text>
      ))}
      {r.note ? <Text style={styles.note}>"{r.note}"</Text> : null}
      {isAdmin && r.status === 'pending' ? (
        <View style={styles.buttons}>
          <AppButton title="Reject" variant="dangerOutline" compact style={{ flex: 1 }} onPress={() => confirmReview(r, false)} disabled={busyId === r.id} />
          <AppButton title="Approve" icon="checkmark" compact style={{ flex: 1 }} onPress={() => confirmReview(r, true)} loading={busyId === r.id} />
        </View>
      ) : null}
    </View>
  );

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
        {isAdmin
          ? 'Family members can ask for changes to their own entry. Approving updates the family record straight away.'
          : 'Changes you have asked for. A family admin approves or rejects them.'}
      </Text>

      <Text style={styles.sectionHeading}>Waiting for review</Text>
      {pending.length === 0 ? (
        <EmptyState icon="checkmark-done-outline" title="Nothing waiting" message="New requests will show up here." />
      ) : (
        pending.map(renderCard)
      )}

      {done.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Earlier requests</Text>
          {done.map(renderCard)}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.sm },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.md, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm + 4, ...shadow.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personName: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  status: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: 2 },
  status_pending: { color: colors.primaryDark, backgroundColor: colors.accent },
  status_approved: { color: colors.textOnPrimary, backgroundColor: colors.success },
  status_rejected: { color: colors.textOnPrimary, backgroundColor: colors.danger },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, marginBottom: spacing.sm },
  change: { color: colors.text, fontSize: fontSize.sm, marginTop: 2 },
  note: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic', marginTop: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
