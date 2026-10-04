import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, Image, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { colors, spacing, radius, fontSize, fontWeight, touchTarget, shadow } from '../lib/theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import TextField from '../components/TextField';
import EmptyState from '../components/EmptyState';

export default function BiographyScreen({ route }) {
  const { personId, personName } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(null);
  const [summary, setSummary] = useState('');
  const [occupation, setOccupation] = useState('');
  const [hometown, setHometown] = useState('');
  const [uploading, setUploading] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null); // the photo shown full-screen, or null

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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const hasContent = bio && (bio.summary || bio.occupation || bio.hometown);

  return (
    <Screen>
      <Text style={styles.sectionHeading}>Their story</Text>
      {editing ? (
        <View style={styles.card}>
          <TextField
            label="Occupation"
            value={occupation}
            onChangeText={setOccupation}
            placeholder="e.g. Rubber tapper, teacher"
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <TextField
            label="Hometown"
            value={hometown}
            onChangeText={setHometown}
            placeholder="e.g. Ipoh, Perak"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextField
            label="Life summary"
            value={summary}
            onChangeText={setSummary}
            placeholder={`A few lines about who ${personName || 'this person'} was...`}
            multiline
          />
          <AppButton title="Save" onPress={save} loading={saving} />
          <AppButton title="Cancel" variant="ghost" onPress={() => setEditing(false)} disabled={saving} style={{ marginTop: spacing.xs }} />
        </View>
      ) : (
        <View style={styles.card}>
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
            <EmptyState
              icon="book-outline"
              title="No story written yet"
              message="A few lines about who they were is plenty to start with."
            />
          )}
          <AppButton
            title={hasContent ? 'Edit story' : 'Write their story'}
            variant={hasContent ? 'secondary' : 'primary'}
            icon="create-outline"
            onPress={startEditing}
          />
        </View>
      )}

      <Text style={styles.sectionHeading}>Photos</Text>
      <View style={styles.card}>
        {photos.length === 0 ? (
          <Text style={styles.emptyText}>No photos yet.</Text>
        ) : (
          <View style={styles.photoGrid}>
            {photos.map((url) => (
              <View key={url} style={styles.photoBox}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => setViewingPhoto(url)}
                  onLongPress={() => confirmDeletePhoto(url)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="View photo"
                >
                  <Image source={{ uri: url }} style={styles.photo} />
                </Pressable>
                <Pressable
                  style={styles.photoDelete}
                  onPress={() => confirmDeletePhoto(url)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete photo"
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textOnPrimary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <AppButton
          title="Add a photo"
          variant="secondary"
          icon="image-outline"
          onPress={addPhoto}
          loading={uploading}
          style={{ marginTop: spacing.md }}
        />
      </View>

      <Modal
        visible={!!viewingPhoto}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setViewingPhoto(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setViewingPhoto(null)}>
          {viewingPhoto ? <Image source={{ uri: viewingPhoto }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <View style={[styles.viewerClose, { top: insets.top + spacing.sm }]}>
            <Ionicons name="close" size={24} color={colors.textOnPrimary} />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  sectionHeading: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  block: { marginBottom: spacing.md },
  label: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  value: { color: colors.text, fontSize: fontSize.md, lineHeight: 24 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoBox: { width: '48%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  photoDelete: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute',
    right: spacing.md,
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
