import { useState, useEffect } from 'react';
import { View, ActivityIndicator, Pressable, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, fontSize, fontWeight, touchTarget } from '../lib/theme';
import WelcomeScreen from '../screens/WelcomeScreen';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FamilyDetailScreen from '../screens/FamilyDetailScreen';
import TreeScreen from '../screens/TreeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ClaimScreen from '../screens/ClaimScreen';
import RequestsScreen from '../screens/RequestsScreen';
import RequestChangeScreen from '../screens/RequestChangeScreen';
import { getMyProfile } from '../lib/profile';
import PersonScreen from '../screens/PersonScreen';
import BiographyScreen from '../screens/BiographyScreen';
import GraveRouteScreen from '../screens/GraveRouteScreen';
import GraveQRScreen from '../screens/GraveQRScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const FamiliesStack = createNativeStackNavigator();

// Makes every screen's backdrop the app's warm off-white instead of the
// default gray, and tints links/back arrows jade green.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

// One look for every title bar in the app.
const headerOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text, fontWeight: fontWeight.medium },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.background },
};

function FamiliesStackScreen() {
  return (
    <FamiliesStack.Navigator screenOptions={headerOptions}>
      <FamiliesStack.Screen name="Home" component={HomeScreen} options={{ title: 'Your Families' }} />
      <FamiliesStack.Screen
        name="FamilyDetail"
        component={FamilyDetailScreen}
        options={({ route, navigation }) => ({
          title: route.params?.familyName || 'Family',
          headerRight: () => (
            <Pressable
              onPress={() =>
                navigation.navigate('Tree', {
                  familyId: route.params?.familyId,
                  familyName: route.params?.familyName,
                })
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open the family tree"
              style={{ minHeight: touchTarget - 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="git-network-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Tree</Text>
            </Pressable>
          ),
        })}
      />
      <FamiliesStack.Screen name="Tree" component={TreeScreen} options={{ title: 'Family tree' }} />
      <FamiliesStack.Screen name="Claim" component={ClaimScreen} options={{ title: 'Find yourself' }} />
      <FamiliesStack.Screen name="Requests" component={RequestsScreen} options={{ title: 'Change requests' }} />
      <FamiliesStack.Screen name="RequestChange" component={RequestChangeScreen} options={{ title: 'Request a change' }} />
      <FamiliesStack.Screen
        name="Person"
        component={PersonScreen}
        options={({ route, navigation }) => ({
          title: route.params?.personName || 'Person',
          headerRight: () => (
            <Pressable
              onPress={() =>
                navigation.popTo('FamilyDetail', {
                  familyId: route.params?.familyId,
                  familyName: route.params?.familyName,
                })
              }
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back to the family list"
              style={{ minHeight: touchTarget - 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Ionicons name="people-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>Family</Text>
            </Pressable>
          ),
        })}
      />
      <FamiliesStack.Screen
        name="Biography"
        component={BiographyScreen}
        options={({ route }) => ({ title: route.params?.personName || 'Story' })}
      />
      <FamiliesStack.Screen name="GraveQR" component={GraveQRScreen} options={{ title: 'QR code' }} />
      <FamiliesStack.Screen
        name="GraveRoute"
        component={GraveRouteScreen}
        options={{ title: 'Directions to the grave' }}
      />
    </FamiliesStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarHideOnKeyboard: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: fontWeight.medium },
        tabBarIcon: ({ color, size, focused }) => {
          const base = route.name === 'Families' ? 'people' : 'settings';
          return <Ionicons name={focused ? base : `${base}-outline`} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Families" component={FamiliesStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // 'checking' | 'needed' (show "Tell us about you" first) | 'done'
  const [profileState, setProfileState] = useState('checking');

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setProfileState('checking');
      return;
    }
    let cancelled = false;
    getMyProfile().then((profile) => {
      if (cancelled) return;
      // If the profile can't be read (e.g. the Stage 5b database update hasn't
      // been run yet), don't lock anyone out — just carry on into the app.
      setProfileState(profile && !profile.profile_complete ? 'needed' : 'done');
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  if (loading || (session && profileState === 'checking')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerOptions}>
        {session && profileState === 'needed' ? (
          <Stack.Screen name="ProfileSetup" options={{ title: 'Welcome' }}>
            {(props) => <ProfileScreen {...props} onSaved={() => setProfileState('done')} />}
          </Stack.Screen>
        ) : session ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Your details' }} />
          </>
        ) : (
          <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
