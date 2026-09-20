import { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import WelcomeScreen from '../screens/WelcomeScreen';
import HomeScreen from '../screens/HomeScreen';
import FamilyDetailScreen from '../screens/FamilyDetailScreen';
import BiographyScreen from '../screens/BiographyScreen';
import GraveRouteScreen from '../screens/GraveRouteScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if there's already a logged-in session (e.g. app was reopened)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for login/logout events from here on
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {session ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Your Families' }} />
            <Stack.Screen name="FamilyDetail" component={FamilyDetailScreen} />
            <Stack.Screen
              name="Biography"
              component={BiographyScreen}
              options={({ route }) => ({ title: route.params?.personName || 'Biography' })}
            />
            <Stack.Screen
              name="GraveRoute"
              component={GraveRouteScreen}
              options={{ title: 'Grave Route' }}
            />
          </>
        ) : (
          <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ title: 'Happy Tree Family' }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}