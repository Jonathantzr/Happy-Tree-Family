import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Alert, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import EmptyState from '../components/EmptyState';

// Small square icon button (move up/down, edit, delete) — still a full-size touch target
const IconBtn = ({ icon, label, onPress, color = colors.primary }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={20} color={color} />
  </Pressable>
);

const EMPTY_GRAVE = { cemetery_name: '', cemetery_map_link: '', cemetery_address: '', general_notes: '' };
const EMPTY_STEP = { title: '', description: '', distance_hint: '', photo_url: '', newPhoto: null };

export default function GraveRouteScreen({ route }) {
  const params = route.params || {};
  const personId = params.personId || params.person?.id || params.id;
  const personName = params.personName || params.person?.name || params.name || 'this person';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grave, setGrave] = useState(null);
  const [steps, setSteps] = useState([]);
  const [graveForm, setGraveForm] = useState(EMPTY_GRAVE);
  const [editingGrave, setEditingGrave] = useState(false);
  const [stepForm, setStepForm] = useState(null);
  const load = useCallback(async () => {
    if (!personId) { setLoading(false); return; }
    const { data: g, error } = await supabase
      .from('graves').select('*').eq('person_id', personId)
      .order('created_at').limit(1).maybeSingle();
    if (error) { Alert.alert('Could not load', error.message); setLoading(false); return; }
    setGrave(g);
    if (g) {
      setGraveForm({
        cemetery_name: g.cemetery_name || '',
        cemetery_map_link: g.cemetery_map_link || '',
        cemetery_address: g.cemetery_address || '',
        general_notes: g.general_notes || '',
      });
      const { data: s, error: e2 } = await supabase
        .from('route_steps').select('*').eq('grave_id', g.id).order('step_order');
      if (e2) Alert.alert('Could not load steps', e2.message);
      setSteps(s || []);
    } else {
      setSteps([]);
      setEditingGrave(true);
    }
    setLoading(false);
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  const saveGrave = async () => {
    if (!graveForm.cemetery_name.trim()) return Alert.alert('Please enter the cemetery name.');
    setSaving(true);
    const fields = {
      cemetery_name: graveForm.cemetery_name.trim(),
      cemetery_map_link: graveForm.cemetery_map_link.trim() || null,
      cemetery_address: graveForm.cemetery_address.trim() || null,
      general_notes: graveForm.general_notes.trim() || null,
    };
    let error;
    if (grave) {
      ({ error } = await supabase.from('graves')
        .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', grave.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from('graves')
        .insert({ ...fields, person_id: personId, created_by: user.id }));
    }
    setSaving(false);
    if (error) return Alert.alert('Could not save', error.message);
    setEditingGrave(false);
    load();
  };

  const openMap = () => {
    const l = grave.cemetery_map_link.trim();
    const url = /^https?:\/\//i.test(l) ? l : 'https://' + l;
    Linking.openURL(url).catch(() => Alert.alert('Could not open that link.'));
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (!res.canceled) {
      setStepForm((f) => ({ ...f, newPhoto: res.assets[0], photo_url: res.assets[0].uri }));
    }
  };

  const uploadPhoto = async (asset) => {
    const ext = (asset.uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
    const path = `${grave.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('route-photos').upload(path, decode(asset.base64), {
      contentType: asset.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });
    if (error) throw error;
    return supabase.storage.from('route-photos').getPublicUrl(path).data.publicUrl;
  };

  const saveStep = async () => {
    if (!stepForm.title.trim()) return Alert.alert('Please give this step a short title.');
    setSaving(true);
    try {
      let photo_url = stepForm.photo_url || null;
      if (stepForm.newPhoto) photo_url = await uploadPhoto(stepForm.newPhoto);
      const fields = {
        title: stepForm.title.trim(),
        description: stepForm.description.trim() || null,
        distance_hint: stepForm.distance_hint.trim() || null,
        photo_url,
      };
      let error;
      if (stepForm.id) {
        ({ error } = await supabase.from('route_steps').update(fields).eq('id', stepForm.id));
      } else {
        const next = steps.length ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1;
        ({ error } = await supabase.from('route_steps')
          .insert({ ...fields, grave_id: grave.id, step_order: next }));
      }
      if (error) throw error;
      setStepForm(null);
      await load();
    } catch (e) {
      Alert.alert('Could not save step', e.message);
    }
    setSaving(false);
  };

  const move = async (index, dir) => {
    const a = steps[index];
    const b = steps[index + dir];
    if (!b) return;
    await supabase.from('route_steps').update({ step_order: -1 }).eq('id', a.id);
    await supabase.from('route_steps').update({ step_order: a.step_order }).eq('id', b.id);
    await supabase.from('route_steps').update({ step_order: b.step_order }).eq('id', a.id);
    load();
  };

  const deleteStep = (s) => {
    Alert.alert('Delete this step?', s.title, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('route_steps').delete().eq('id', s.id);
          if (error) Alert.alert('Could not delete', error.message);
          load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!personId) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Something went wrong"
          message="This screen could not tell which person you opened. Please go back and try again."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.intro}>How to find the grave of {personName}</Text>

      {editingGrave ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{grave ? 'Edit cemetery' : 'First, where is the cemetery?'}</Text>
          <Text style={styles.help}>
            In Google Maps or Waze, tap Share → Copy link, then paste it below. That link takes people to the
            cemetery entrance. The steps you add afterwards take over from there.
          </Text>
          <TextField
            label="Cemetery name"
            placeholder="e.g. Ipoh Chinese Cemetery"
            value={graveForm.cemetery_name}
            autoCapitalize="words"
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_name: t })}
          />
          <TextField
            label="Map link (optional)"
            placeholder="Paste a Google Maps or Waze link"
            value={graveForm.cemetery_map_link}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_map_link: t })}
          />
          <TextField
            label="Address (optional)"
            value={graveForm.cemetery_address}
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_address: t })}
          />
          <TextField
            label="General notes (optional)"
            multiline
            value={graveForm.general_notes}
            placeholder="e.g. very busy during Ching Ming, arrive early"
            onChangeText={(t) => setGraveForm({ ...graveForm, general_notes: t })}
          />
          <AppButton title="Save cemetery" onPress={saveGrave} loading={saving} />
          {grave ? (
            <AppButton
              title="Cancel"
              variant="ghost"
              disabled={saving}
              onPress={() => { setEditingGrave(false); load(); }}
              style={{ marginTop: spacing.xs }}
            />
          ) : null}
        </View>
      ) : grave ? (
        <View style={styles.card}>
          <View style={styles.cemeteryHeader}>
            <View style={styles.cemeteryIcon}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{grave.cemetery_name}</Text>
              {grave.cemetery_address ? <Text style={styles.muted}>{grave.cemetery_address}</Text> : null}
            </View>
          </View>
          {grave.general_notes ? <Text style={styles.body}>{grave.general_notes}</Text> : null}
          <View style={styles.buttonRow}>
            {grave.cemetery_map_link ? (
              <AppButton title="Open in Maps" icon="navigate-outline" compact onPress={openMap} style={styles.rowButton} />
            ) : null}
            <AppButton
              title="Edit"
              variant="secondary"
              icon="create-outline"
              compact
              onPress={() => setEditingGrave(true)}
              style={styles.rowButton}
            />
          </View>
        </View>
      ) : (
        <EmptyState icon="cloud-offline-outline" title="Could not load the directions" message="Please go back and try again." />
      )}

      {grave && !editingGrave && (
        <View>
          <Text style={styles.sectionHeading}>From the entrance to the grave</Text>
          {steps.length === 0 && !stepForm && (
            <Text style={styles.help}>
              No steps yet. Add them in order, like: "Enter the east gate" → "Park by the red temple" →
              "Walk 100m past the big tree". Photos are optional!
            </Text>
          )}

          {steps.map((s, i) => (
            <View key={s.id} style={styles.card}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{s.title}</Text>
              </View>
              {s.distance_hint ? <Text style={styles.muted}>{s.distance_hint}</Text> : null}
              {s.description ? <Text style={styles.body}>{s.description}</Text> : null}
              {s.photo_url ? <Image source={{ uri: s.photo_url }} style={styles.photo} /> : null}
              <View style={styles.stepActions}>
                {i > 0 ? <IconBtn icon="arrow-up" label="Move step up" onPress={() => move(i, -1)} /> : null}
                {i < steps.length - 1 ? <IconBtn icon="arrow-down" label="Move step down" onPress={() => move(i, 1)} /> : null}
                <View style={{ flex: 1 }} />
                <IconBtn
                  icon="create-outline"
                  label="Edit step"
                  onPress={() => setStepForm({
                    id: s.id, title: s.title || '', description: s.description || '',
                    distance_hint: s.distance_hint || '', photo_url: s.photo_url || '', newPhoto: null,
                  })}
                />
                <IconBtn icon="trash-outline" label="Delete step" color={colors.danger} onPress={() => deleteStep(s)} />
              </View>
            </View>
          ))}

          {stepForm ? (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: spacing.md }]}>{stepForm.id ? 'Edit step' : 'New step'}</Text>
              <TextField
                label="Short title"
                value={stepForm.title}
                placeholder="e.g. Enter via the east gate"
                onChangeText={(t) => setStepForm({ ...stepForm, title: t })}
              />
              <TextField
                label="Details (optional)"
                multiline
                value={stepForm.description}
                placeholder="e.g. Park near the red temple building"
                onChangeText={(t) => setStepForm({ ...stepForm, description: t })}
              />
              <TextField
                label="How far / landmark (optional)"
                value={stepForm.distance_hint}
                placeholder="e.g. ~100m, just past the big banyan tree"
                onChangeText={(t) => setStepForm({ ...stepForm, distance_hint: t })}
              />
              {stepForm.photo_url ? <Image source={{ uri: stepForm.photo_url }} style={[styles.photo, { marginBottom: spacing.sm }]} /> : null}
              <View style={[styles.buttonRow, { marginTop: 0, marginBottom: spacing.md }]}>
                <AppButton
                  title={stepForm.photo_url ? 'Change photo' : 'Add a photo (optional)'}
                  variant="secondary"
                  icon="image-outline"
                  compact
                  onPress={pickPhoto}
                  style={styles.rowButton}
                />
                {stepForm.photo_url ? (
                  <AppButton
                    title="Remove"
                    variant="ghost"
                    compact
                    onPress={() => setStepForm({ ...stepForm, photo_url: '', newPhoto: null })}
                  />
                ) : null}
              </View>
              <AppButton title="Save step" onPress={saveStep} loading={saving} />
              <AppButton title="Cancel" variant="ghost" disabled={saving} onPress={() => setStepForm(null)} style={{ marginTop: spacing.xs }} />
            </View>
          ) : (
            <AppButton title="Add a step" icon="add" onPress={() => setStepForm({ ...EMPTY_STEP })} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  pressed: { opacity: 0.6 },
  intro: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.md },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: spacing.sm, marginBottom: spacing.sm },
  help: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  body: { color: colors.text, fontSize: fontSize.md, lineHeight: 22, marginTop: spacing.sm },
  cemeteryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cemeteryIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  rowButton: { flexGrow: 1 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  photo: { width: '100%', height: 180, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.surfaceAlt },
  stepActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, paddingTop: spacing.xs },
  iconBtn: { width: touchTarget, height: touchTarget, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
