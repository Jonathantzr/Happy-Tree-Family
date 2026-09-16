import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import WelcomeScreen from '../screens/WelcomeScreen';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

// For now this is hardcoded to "not logged in" — Step 1b will make this
// switch automatically based on real login state.
const isLoggedIn = false;

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isLoggedIn ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ title: 'Happy Tree Family' }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}