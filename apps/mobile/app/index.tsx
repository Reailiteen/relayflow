import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { isAuthenticated } from '@relayflow/access';
import { colorsFor, fontSize, space } from '@relayflow/tokens';
import { resolveActor } from '../src/session';

/**
 * Placeholder. Which portal mobile carries — most likely the candidate one,
 * since ID and bank documents are photographed on a phone — is still open.
 */
export default function HomeScreen() {
  const colors = colorsFor(useColorScheme());
  const actor = resolveActor();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>RelayFlow</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {isAuthenticated(actor) ? `Acting as ${actor.fullName} (${actor.kind})` : 'Signed out.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6] },
  title: { fontSize: fontSize['3xl'], fontWeight: '600' },
  body: { fontSize: fontSize.base, textAlign: 'center' },
});
