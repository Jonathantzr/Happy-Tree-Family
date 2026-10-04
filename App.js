import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './lib/i18n';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
  // The app is upright (portrait) everywhere. Only the family tree lets the
  // phone be turned sideways — it unlocks this itself while it is open.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
