import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, StyleSheet, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export default function BiographyScreen({ route }) {
  const { personId, personName } = route.params;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(null);
  const [summary, setSummary] = useState('');
  const [occupation, setOccupation] = useState('');
  const [hometown, setHometown] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadBio();
  }, []);

  async function loadBio() {
    setLoading(true);
    const { data, error } = await supabase
      .from('biographies')
      .select('*')
      .eq('person_id', personId)
      .maybeSingle();
    if (error) Alert.alert('Could not load biography', error.message);
    setBio(data || null);
    setLoading(false);
  }

  function startEditing() {
    setSummary(bio?.summary || '');
    setOccupation(bio?.occupation || '');
    setHometown(bio?.hometown || '');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const row = {
      person_id: personId,
      summary: summary.trim() || null,
      occupation: occupation.trim() || null,
      hometown: hometown.trim() || null,
      updated_by: userData?.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('biographies')
      .upsert(row, { onConflict: 'person_id' })
      .select()
      .single();
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setBio(data);
    setEditing(false);
  }

    const photos = bio?.photo_urls || [];

  // saves the list of photo links into the biography (creates the biography row if needed)
  async function savePhotoList(newList) {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('biographies')
      .upsert(
        {
          person_id: personId,
          photo_urls: newList,
          updated_by: userData?.user?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id' }
      )
      .select()
      .single();
    if (error) throw error;
    setBio(data);
  }

  async function addPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
    if (result.canceled) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime.split('/')[1] || 'jpg';
      const path = `${personId}/${Date.now()}.${ext}`;
      const fileData = decode(asset.base64);
      const { error: upErr } = await supabase.storage
        .from('bio-photos')
        .upload(path, fileData, { contentType: mime });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('bio-photos').getPublicUrl(path);
      await savePhotoList([...photos, urlData.publicUrl]);
    } catch (e) {
      Alert.alert('Could not add photo', e.message);
    }
    setUploading(false);
  }

  function confirmDeletePhoto(url) {
    Alert.alert('Delete this photo?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePhoto(url) },
    ]);
  }

  async function deletePhoto(url) {
    try {
      const path = url.split('/bio-photos/')[1];
      if (path) {
        await supabase.storage.from('bio-photos').remove([decodeURIComponent(path)]);
      }
      await savePhotoList(photos.filter((u) => u !== url));
    } catch (e) {
      Alert.alert('Could not delete photo', e.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const hasContent = bio && (bio.summary || bio.occupation || bio.hometown);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.name}>{personName}</Text>

          {editing ? (
            <View>
              <Text style={styles.label}>Occupation</Text>
              <TextInput
                style={styles.input}
                value={occupation}
                onChangeText={setOccupation}
                placeholder="e.g. Rubber tapper, teacher"
              />

              <Text style={styles.label}>Hometown</Text>
              <TextInput
                style={styles.input}
                value={hometown}
                onChangeText={setHometown}
                placeholder="e.g. Segamat, Johor"
              />

              <Text style={styles.label}>Life summary</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={summary}
                onChangeText={setSummary}
                placeholder="A few lines about who this person was..."
                multiline
                textAlignVertical="top"
              />

              <Pressable onPress={save} disabled={saving} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
              </Pressable>
              <Pressable onPress={() => setEditing(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {hasContent ? (
                <View>
                  {bio.occupation ? (
                    <View style={styles.block}>
                      <Text style={styles.label}>Occupation</Text>
                      <Text style={styles.value}>{bio.occupation}</Text>
                    </View>
                  ) : null}
                  {bio.hometown ? (
                    <View style={styles.block}>
                      <Text style={styles.label}>Hometown</Text>
                      <Text style={styles.value}>{bio.hometown}</Text>
                    </View>
                  ) : null}
                  {bio.summary ? (
                    <View style={styles.block}>
                      <Text style={styles.label}>Life summary</Text>
                      <Text style={styles.value}>{bio.summary}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.emptyText}>
                  No biography yet. Tap the button below to write one.
                </Text>
              )}

              <Pressable onPress={startEditing} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {hasContent ? 'Edit biography' : 'Write biography'}
                </Text>
              </Pressable>
            </View>
          )}
          <View style={styles.photoSection}>
            <Text style={styles.label}>Photos</Text>
            {photos.length === 0 ? (
              <Text style={styles.emptyText}>No photos yet.</Text>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map((url) => (
                  <Pressable key={url} onLongPress={() => confirmDeletePhoto(url)} style={styles.photoBox}>
                    <Image source={{ uri: url }} style={styles.photo} />
                  </Pressable>
                ))}
              </View>
            )}
            {photos.length > 0 ? (
              <Text style={styles.hint}>Long-press a photo to delete it.</Text>
            ) : null}
            <Pressable onPress={addPhoto} disabled={uploading} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{uploading ? 'Uploading...' : 'Add photo'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 60 },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  block: { marginBottom: 18 },
  label: { fontSize: 13, color: '#666', marginBottom: 6, marginTop: 6 },
  value: { fontSize: 16, lineHeight: 22 },
  emptyText: { fontSize: 16, color: '#666', marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, fontSize: 16, marginBottom: 10,
  },
  multiline: { minHeight: 140 },
  primaryButton: {
    backgroundColor: '#2e7d32', padding: 14, borderRadius: 8,
    alignItems: 'center', marginTop: 14,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { padding: 14, alignItems: 'center', marginTop: 6 },
  secondaryButtonText: { color: '#555', fontSize: 16 },
  photoSection: { marginTop: 28 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoBox: { width: '48%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#eee' },
  hint: { fontSize: 12, color: '#888', marginTop: 8 },
});