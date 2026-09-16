import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState([]);
  const [familyName, setFamilyName] = useState('');
  const [surnameCn, setSurnameCn] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchFamilies();
  }, []);

  // Load every family this logged-in user belongs to
  async function fetchFamilies() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('family_members')
      .select('role, families(id, name, surname_cn)')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('Error loading families', error.message);
    } else {
      setFamilies(data);
    }
    setLoading(false);
  }

  async function handleCreateFamily() {
    if (!familyName.trim()) {
      Alert.alert('Family name required', 'e.g. "Tan Family (Segamat)"');
      return;
    }
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Not logged in', 'Please log out and log back in.');
      setCreating(false);
      return;
    }

    // 1. Create the family
    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({
        name: familyName.trim(),
        surname_cn: surnameCn.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (familyError) {
      Alert.alert('Error creating family', familyError.message);
      setCreating(false);
      return;
    }

    // 2. Make the creator its first admin
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

    setFamilyName('');
    setSurnameCn('');
    setCreating(false);
    fetchFamilies(); // refresh the list
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your Families</Text>

      <FlatList
        data={families}
        keyExtractor={(item) => item.families.id}
        renderItem={({ item }) => (
          <View style={styles.familyRow}>
            <Text style={styles.familyName}>{item.families.name}</Text>
            <Text style={styles.familyRole}>{item.role}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>You haven't created or joined a family yet.</Text>}
        style={styles.list}
      />

      <View style={styles.form}>
        <Text style={styles.formHeading}>Create a New Family</Text>
        <TextInput
          style={styles.input}
          placeholder="Family name (e.g. Tan Family - Segamat)"
          value={familyName}
          onChangeText={setFamilyName}
        />
        <TextInput
          style={styles.input}
          placeholder="Chinese surname, optional (e.g. 陈)"
          value={surnameCn}
          onChangeText={setSurnameCn}
        />
        <Button
          title={creating ? 'Creating...' : 'Create Family'}
          onPress={handleCreateFamily}
          disabled={creating}
        />
      </View>

      <View style={styles.logoutButton}>
        <Button title="Log Out" onPress={handleLogout} color="#999" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  list: { maxHeight: 200, marginBottom: 20 },
  familyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  familyName: { fontSize: 16 },
  familyRole: { fontSize: 14, color: '#888' },
  emptyText: { color: '#888', fontStyle: 'italic' },
  form: { marginBottom: 30 },
  formHeading: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  logoutButton: { marginTop: 'auto' },
});