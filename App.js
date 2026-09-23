import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from './lib/i18n';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
    return (
    <SafeAreaProvider>
      <LanguageProvider>
        <RootNavigator />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}