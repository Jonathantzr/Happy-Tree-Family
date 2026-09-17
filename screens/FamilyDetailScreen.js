import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, Pressable, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';

// Turns a JS Date object into "DD/MM/YYYY" for display
function formatDateDisplay(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

// Turns a JS Date object into "YYYY-MM-DD" for saving to the database
function toISODate(date) {
  if (!date) return null;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Turns a database date string ("YYYY-MM-DD") into "DD/MM/YYYY" for display
function formatISOToDisplay(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

// Decides what to show under a person's name: a date range if both birth and
// death are known, a single date if only one is known, "Deceased" only as a
// last resort if there's no date at all, or nothing if there's truly no info.
function formatPersonMeta(item) {
  const born = item.birth_date ? formatISOToDisplay(item.birth_date) : null;
  const died = item.death_date ? formatISOToDisplay(item.death_date) : null;

  if (born && died) return `${born} - ${died}`;
  if (born) return born;
  if (died) return died;
  if (item.is_deceased) return 'Deceased';
  return '';
}

export default function FamilyDetailScreen({ route, navigation }) {
  const { familyId, familyName } = route.params;

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);

  const [name, setName] = useState('');
  const [gender, setGender] = useState(null); // 'M' | 'F' | 'other' | null
  const [isDeceased, setIsDeceased] = useState(false);
  const [birthDate, setBirthDate] = useState(null); // JS Date or null
  const [deathDate, setDeathDate] = useState(null);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [showDeathPicker, setShowDeathPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: familyName });
    fetchPeople();
  }, []);

  async function fetchPeople() {
    setLoading(true);
    const { data, error } = await supabase
      .from('persons')
      .select('*')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });

    if (error) {
      Alert.alert('Error loading people', error.message);
    } else {
      setPeople(data);
    }
    setLoading(false);
  }

  async function handleAddPerson() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('persons').insert({
      family_id: familyId,
      name_en: name.trim(),
      gender: gender,
      is_deceased: isDeceased,
      birth_date: toISODate(birthDate),
      death_date: isDeceased ? toISODate(deathDate) : null,
      date_precision: birthDate ? 'exact' : 'unknown',
    });

    if (error) {
      Alert.alert('Error adding person', error.message);
      setSaving(false);
      return;
    }

    setName('');
    setGender(null);
    setIsDeceased(false);
    setBirthDate(null);
    setDeathDate(null);
    setSaving(false);
    fetchPeople();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.list}>
            {people.length === 0 ? (
              <Text style={styles.emptyText}>No one added yet — add the first person below.</Text>
            ) : (
              people.map((item) => (
                <View key={item.id} style={styles.personRow}>
                  <Text style={styles.personName}>
                    {item.name_en || item.name_pinyin || item.name_cn}
                  </Text>
                  {formatPersonMeta(item) ? (
                    <Text style={styles.personMeta}>{formatPersonMeta(item)}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.form}>
            <Text style={styles.formHeading}>Add a Person</Text>

            <TextInput
              style={styles.input}
              placeholder="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <View style={styles.genderRow}>
              {['M', 'F', 'other'].map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(gender === g ? null : g)}
                  style={[styles.genderButton, gender === g && styles.genderButtonSelected]}
                >
                  <Text style={gender === g ? styles.genderTextSelected : styles.genderText}>
                    {g === 'M' ? 'Male' : g === 'F' ? 'Female' : 'Other'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text>Deceased</Text>
              <Switch value={isDeceased} onValueChange={setIsDeceased} />
            </View>

            <Pressable style={styles.input} onPress={() => setShowBirthPicker(true)}>
              <Text style={birthDate ? styles.dateText : styles.datePlaceholder}>
                {birthDate ? formatDateDisplay(birthDate) : 'Birth date, optional — tap to pick'}
              </Text>
            </Pressable>
            {showBirthPicker && (
              <DateTimePicker
                value={birthDate || new Date(1950, 0, 1)}
                mode="date"
                display="default"
                maximumDate={new Date()}
                minimumDate={new Date(1500, 0, 1)}
                onChange={(event, selectedDate) => {
                  setShowBirthPicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setBirthDate(selectedDate);
                  }
                }}
              />
            )}

            {isDeceased && (
              <>
                <Pressable style={styles.input} onPress={() => setShowDeathPicker(true)}>
                  <Text style={deathDate ? styles.dateText : styles.datePlaceholder}>
                    {deathDate ? formatDateDisplay(deathDate) : 'Death date, optional — tap to pick'}
                  </Text>
                </Pressable>
                {showDeathPicker && (
                  <DateTimePicker
                    value={deathDate || new Date()}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    minimumDate={new Date(1500, 0, 1)}
                    onChange={(event, selectedDate) => {
                      setShowDeathPicker(false);
                      if (event.type === 'set' && selectedDate) {
                        setDeathDate(selectedDate);
                      }
                    }}
                  />
                )}
              </>
            )}

            <Button
              title={saving ? 'Saving...' : 'Add Person'}
              onPress={handleAddPerson}
              disabled={saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  list: { marginBottom: 10 },
  personRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  personName: { fontSize: 16 },
  personMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  emptyText: { color: '#888', fontStyle: 'italic' },
  form: { marginTop: 10 },
  formHeading: { fontSize: 18, fontWeight: '600', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, justifyContent: 'center', minHeight: 44 },
  dateText: { color: '#000' },
  datePlaceholder: { color: '#999' },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  genderButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, alignItems: 'center' },
  genderButtonSelected: { backgroundColor: '#333', borderColor: '#333' },
  genderText: { color: '#333' },
  genderTextSelected: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
});