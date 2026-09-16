import { View, Text, Button, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're logged in!</Text>
      <Text style={{ marginBottom: 24 }}>Family dashboard goes here next.</Text>
      <Button title="Log Out" onPress={() => supabase.auth.signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
});