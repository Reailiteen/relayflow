import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colorsFor } from '@relayflow/tokens';

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
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SafeAreaProvider>
  );
}
