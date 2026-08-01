import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colorsFor } from '@relayflow/tokens';
import { PersonaSwitcher } from '../src/persona-switcher';

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = colorsFor(scheme);

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          // Colours come from the shared token package, so web and mobile stay
          // the same product rather than drifting apart one screen at a time.
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <PersonaSwitcher />,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="candidate/index" options={{ title: 'Your application' }} />
        <Stack.Screen name="candidate/documents" options={{ title: 'Documents' }} />
        <Stack.Screen name="startup/index" options={{ title: 'Your internships' }} />
        <Stack.Screen name="startup/candidates" options={{ title: 'Candidates' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
