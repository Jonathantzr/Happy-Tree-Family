import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, Alert, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

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
  const [families, setFamilies] = useState([]);
  const [familyName, setFamilyName] = useState('');
  const [surnameCn, setSurnameCn] = useState('');
  const [creating, setCreating] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchFamilies();
  }, []);

  async function fetchFamilies() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('family_members')
      .select('role, families(id, name, surname_cn, join_code)')
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

    setFamilyName('');
    setSurnameCn('');
    setCreating(false);
    fetchFamilies();
  }

  async function handleJoinFamily() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Join code required', 'Ask a family admin for their 6-character join code.');
      return;
    }
    setJoining(true);

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

    setFamilyName('');
    setSurnameCn('');
    setCreating(false);
    fetchFamilies();
  }

  async function handleJoinFamily() {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Join code required', 'Ask a family admin for their 6-character join code.');
      return;
    }
    setJoining(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Not logged in', 'Please log out and log back in.');
      setJoining(false);
      return;
    }

    const { data: family, error: findError } = await supabase
      .from('families')
      .select('id, name')
      .eq('join_code', code)
      .single();

    if (findError || !family) {
      Alert.alert('Family not found', 'Double check the code and try again.');
      setJoining(false);
      return;
    }

    const { error: joinError } = await supabase
      .from('family_members')
      .insert({
        family_id: family.id,
        user_id: user.id,
        role: 'member',
      });

    if (joinError) {
      if (joinError.code === '23505') {
        Alert.alert('Already a member', `You're already part of "${family.name}".`);
      } else {
        Alert.alert('Error joining family', joinError.message);
      }
      setJoining(false);
      return;
    }

    Alert.alert('Joined!', `You've joined "${family.name}".`);
    setJoinCodeInput('');
    setJoining(false);
    fetchFamilies();
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
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Your Families</Text>

      <FlatList
        data={families}
        keyExtractor={(item) => item.families.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.familyRow}
            onPress={() => navigation.navigate('FamilyDetail', {
              familyId: item.families.id,
              familyName: item.families.name,
            })}
          >
            <View>
              <Text style={styles.familyName}>{item.families.name}</Text>
              <Text style={styles.familyCode}>Join code: {item.families.join_code}</Text>
            </View>
            <Text style={styles.familyRole}>{item.role}</Text>
          </Pressable>
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

      <View style={styles.form}>
        <Text style={styles.formHeading}>Join a Family</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter 6-character join code"
          value={joinCodeInput}
          onChangeText={setJoinCodeInput}
          autoCapitalize="characters"
        />
        <Button
          title={joining ? 'Joining...' : 'Join Family'}
          onPress={handleJoinFamily}
          disabled={joining}
        />
      </View>

      <View style={styles.logoutButton}>
        <Button title="Log Out" onPress={handleLogout} color="#999" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  list: { maxHeight: 200, marginBottom: 20 },
  familyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  familyName: { fontSize: 16 },
  familyCode: { fontSize: 12, color: '#888', marginTop: 2 },
  familyRole: { fontSize: 14, color: '#888' },
  emptyText: { color: '#888', fontStyle: 'italic' },
  form: { marginBottom: 30 },
  formHeading: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10 },
  logoutButton: { marginTop: 'auto' },
});