import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, Pressable, RefreshControl, Keyboard } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getMyProfile, addMeToFamily } from '../lib/profile';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import EmptyState from '../components/EmptyState';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I — easy to read aloud

function generateJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [families, setFamilies] = useState([]);
  const [familyName, setFamilyName] = useState('');
  const [surnameCn, setSurnameCn] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchFamilies();
  }, []);

  async function fetchFamilies() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('family_members')
      .select('role, families(id, name, surname_cn, join_code)')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('Error loading families', error.message);
    } else {
      setFamilies((data || []).filter((row) => row.families));
    }
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchFamilies();
    setRefreshing(false);
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) {
      Alert.alert('Family name required', 'e.g. "Tan Family (Segamat)"');
      return;
    }
    Keyboard.dismiss();
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Not logged in', 'Please log out and log back in.');
      setCreating(false);
      return;
    }

    let family = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5 && !family; attempt++) {
      const { data, error } = await supabase
        .from('families')
        .insert({
          name: familyName.trim(),
          surname_cn: surnameCn.trim() || null,
          created_by: user.id,
          join_code: generateJoinCode(),
        })
        .select()
        .single();

      if (!error) {
        family = data;
      } else {
        lastError = error;
      }
    }

    if (!family) {
      Alert.alert('Error creating family', lastError?.message || 'Please try again.');
      setCreating(false);
      return;
    }

    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: family.id,
        user_id: user.id,
        role: 'admin',
      });

    if (memberError) {
      Alert.alert('Error joining family as admin', memberError.message);
      setCreating(false);
      return;
    }

    // You're the first person in a new family — add you straight away, from
    // your account details, so the tree starts with you.
    const profile = await getMyProfile();
    if (profile && profile.profile_complete) {
      const { error: meError } = await addMeToFamily(family.id, profile);
      if (meError) Alert.alert('Family created, but you were not added to it', meError.message);
    }

    setFamilyName('');
    setSurnameCn('');
    setCreating(false);
    fetchFamilies();
    navigation.navigate('FamilyDetail', { familyId: family.id, familyName: family.name });
  }

  async function handleJoinFamily() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Join code required', 'Ask a family admin for their 6-character join code.');
      return;
    }
    Keyboard.dismiss();
    setJoining(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Not logged in', 'Please log out and log back in.');
      setJoining(false);
      return;
    }

    // The database checks the code and adds you in one step (join_family in
    // supabase/stage5f-lock-down-tables.sql) — people who aren't members yet
    // are not allowed to look families up directly.
    const { data: joined, error: joinError } = await supabase.rpc('join_family', { p_code: code });
    const result = Array.isArray(joined) ? joined[0] : joined;

    if (joinError || !result) {
      Alert.alert('Could not join', joinError?.message || 'Double check the code and try again.');
      setJoining(false);
      return;
    }
    const family = { id: result.family_id, name: result.family_name };
    if (result.already_member) {
      Alert.alert('Already a member', `You're already part of "${family.name}".`);
      setJoining(false);
      return;
    }

    setJoinCodeInput('');
    setJoining(false);
    fetchFamilies();
    // next: find yourself among the people already in this family
    navigation.navigate('Claim', { familyId: family.id, familyName: family.name });
  }

  async function copyCode(family) {
    await Clipboard.setStringAsync(family.join_code);
    setCopiedId(family.id);
    setTimeout(() => setCopiedId((current) => (current === family.id ? null : current)), 1500);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      }
    >
      {families.length === 0 ? (
        <View style={styles.card}>
          <EmptyState
            icon="people-outline"
            title="No families yet"
            message="Start a new family below, or join one with a code from a relative."
          />
        </View>
      ) : (
        families.map((item) => (
          <View key={item.families.id} style={styles.card}>
            <Pressable
              style={({ pressed }) => [styles.familyMain, pressed && styles.pressed]}
              onPress={() =>
                navigation.navigate('FamilyDetail', {
                  familyId: item.families.id,
                  familyName: item.families.name,
                })
              }
              accessibilityRole="button"
            >
              <View style={styles.familyIcon}>
                <Ionicons name="people" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.familyName} numberOfLines={2}>{item.families.name}</Text>
                <Text style={styles.familyRole}>
                  {item.role === 'admin' ? 'You are an admin' : 'You are a member'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>Join code</Text>
              <Text style={styles.codeValue} selectable>{item.families.join_code}</Text>
              <Pressable
                onPress={() => copyCode(item.families)}
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Copy join code"
              >
                <Ionicons
                  name={copiedId === item.families.id ? 'checkmark' : 'copy-outline'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.copyText}>{copiedId === item.families.id ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Text style={styles.sectionHeading}>Start a new family</Text>
      <View style={[styles.card, styles.formCard]}>
        <TextField
          label="Family name"
          placeholder="e.g. Tan Family - Segamat"
          value={familyName}
          onChangeText={setFamilyName}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextField
          label="Chinese surname (optional)"
          placeholder="e.g. 陈"
          value={surnameCn}
          onChangeText={setSurnameCn}
          returnKeyType="done"
        />
        <AppButton title="Create family" icon="add" onPress={handleCreateFamily} loading={creating} />
      </View>

      <Text style={styles.sectionHeading}>Join a family</Text>
      <View style={[styles.card, styles.formCard]}>
        <TextField
          label="Join code"
          placeholder="6 characters, from a family admin"
          value={joinCodeInput}
          onChangeText={setJoinCodeInput}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={handleJoinFamily}
        />
        <AppButton title="Join family" variant="secondary" icon="enter-outline" onPress={handleJoinFamily} loading={joining} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  formCard: { padding: spacing.md },
  pressed: { opacity: 0.6 },
  familyMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: touchTarget },
  familyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  familyName: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  familyRole: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },
  codeLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  codeValue: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.medium, letterSpacing: 1.5 },
  copyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: touchTarget, paddingHorizontal: spacing.md },
  copyText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.sm, marginBottom: spacing.sm },
});
