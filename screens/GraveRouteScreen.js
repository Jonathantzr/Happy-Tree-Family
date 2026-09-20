import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  Alert, Linking, ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

const GREEN = '#2f6f4f';

const Btn = ({ label, onPress, kind, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[styles.btn, kind === 'grey' && styles.btnGrey, kind === 'red' && styles.btnRed, disabled && { opacity: 0.5 }]}
  >
    <Text style={styles.btnText}>{label}</Text>
  </TouchableOpacity>
);

const Field = ({ label, value, onChangeText, multiline, placeholder, autoCapitalize }) => (
  <View>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.multi]}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      placeholder={placeholder}
      autoCapitalize={autoCapitalize}
    />
  </View>
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
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

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

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={GREEN} />;
  if (!personId) {
    return <Text style={{ padding: 16 }}>Sorry, this screen could not tell which person you opened. Tell Claude!</Text>;
  }

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: 40 + kbHeight }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.h1}>Grave route for {personName}</Text>

      {editingGrave ? (
        <View>
          <Text style={styles.help}>
            Step 1: where is the cemetery? In Google Maps or Waze, tap Share → Copy link, then paste it below.
            That link takes people to the cemetery entrance. The steps you add afterwards take over from there.
          </Text>
          <Field label="Cemetery name *" value={graveForm.cemetery_name}
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_name: t })} />
          <Field label="Map link (Google Maps / Waze)" value={graveForm.cemetery_map_link} autoCapitalize="none"
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_map_link: t })} />
          <Field label="Address (optional)" value={graveForm.cemetery_address}
            onChangeText={(t) => setGraveForm({ ...graveForm, cemetery_address: t })} />
          <Field label="General notes (optional)" multiline value={graveForm.general_notes}
            placeholder="e.g. very busy during Ching Ming, arrive early"
            onChangeText={(t) => setGraveForm({ ...graveForm, general_notes: t })} />
          <View style={styles.row}>
            <Btn label={saving ? 'Saving...' : 'Save cemetery'} onPress={saveGrave} disabled={saving} />
            {grave && <Btn label="Cancel" kind="grey" onPress={() => { setEditingGrave(false); load(); }} />}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.stepTitle}>{grave.cemetery_name}</Text>
          {grave.cemetery_address ? <Text style={styles.hint}>{grave.cemetery_address}</Text> : null}
          {grave.general_notes ? <Text>{grave.general_notes}</Text> : null}
          <View style={styles.row}>
            {grave.cemetery_map_link ? <Btn label="Open in Maps" onPress={openMap} /> : null}
            <Btn label="Edit cemetery" kind="grey" onPress={() => setEditingGrave(true)} />
          </View>
        </View>
      )}

      {grave && !editingGrave && (
        <View>
          <Text style={styles.h2}>Steps from the entrance to the grave</Text>
          {steps.length === 0 && !stepForm && (
            <Text style={styles.help}>
              No steps yet. Add them in order, like: "Enter the east gate" → "Park by the red temple" →
              "Walk 100m past the big tree". Photos are optional!
            </Text>
          )}

          {steps.map((s, i) => (
            <View key={s.id} style={styles.card}>
              <Text style={styles.stepTitle}>{i + 1}. {s.title}</Text>
              {s.distance_hint ? <Text style={styles.hint}>Distance: {s.distance_hint}</Text> : null}
              {s.description ? <Text>{s.description}</Text> : null}
              {s.photo_url ? <Image source={{ uri: s.photo_url }} style={styles.photo} /> : null}
              <View style={styles.row}>
                {i > 0 && <Btn label="Up" kind="grey" onPress={() => move(i, -1)} />}
                {i < steps.length - 1 && <Btn label="Down" kind="grey" onPress={() => move(i, 1)} />}
                <Btn label="Edit" onPress={() => setStepForm({
                  id: s.id, title: s.title || '', description: s.description || '',
                  distance_hint: s.distance_hint || '', photo_url: s.photo_url || '', newPhoto: null,
                })} />
                <Btn label="Delete" kind="red" onPress={() => deleteStep(s)} />
              </View>
            </View>
          ))}

          {stepForm ? (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>{stepForm.id ? 'Edit step' : 'New step'}</Text>
              <Field label="Short title *" value={stepForm.title} placeholder="e.g. Enter via the east gate"
                onChangeText={(t) => setStepForm({ ...stepForm, title: t })} />
              <Field label="Details (optional)" multiline value={stepForm.description}
                placeholder="e.g. Park near the red temple building"
                onChangeText={(t) => setStepForm({ ...stepForm, description: t })} />
              <Field label="How far / landmark (optional)" value={stepForm.distance_hint}
                placeholder="e.g. ~100m, just past the big banyan tree"
                onChangeText={(t) => setStepForm({ ...stepForm, distance_hint: t })} />
              {stepForm.photo_url ? <Image source={{ uri: stepForm.photo_url }} style={styles.photo} /> : null}
              <View style={styles.row}>
                <Btn label={stepForm.photo_url ? 'Change photo' : 'Add photo (optional)'} kind="grey" onPress={pickPhoto} />
                {stepForm.photo_url ? (
                  <Btn label="Remove photo" kind="grey"
                    onPress={() => setStepForm({ ...stepForm, photo_url: '', newPhoto: null })} />
                ) : null}
              </View>
              <View style={styles.row}>
                <Btn label={saving ? 'Saving...' : 'Save step'} onPress={saveStep} disabled={saving} />
                <Btn label="Cancel" kind="grey" onPress={() => setStepForm(null)} />
              </View>
            </View>
          ) : (
            <Btn label="+ Add a step" onPress={() => setStepForm({ ...EMPTY_STEP })} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 350 },
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 6 },
  help: { color: '#666', marginBottom: 10 },
  label: { fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  multi: { minHeight: 70, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  hint: { color: '#555', marginBottom: 4 },
  photo: { width: '100%', height: 180, borderRadius: 8, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  btn: { backgroundColor: GREEN, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8, marginTop: 6 },
  btnGrey: { backgroundColor: '#777' },
  btnRed: { backgroundColor: '#b23b3b' },
  btnText: { color: '#fff', fontWeight: '600' },
});