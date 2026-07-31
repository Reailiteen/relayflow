import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { isAuthenticated, type MaybeActor } from '@relayflow/access';
import { colorsFor, fontSize, space } from '@relayflow/tokens';
import { resolveActor } from '../src/session';

/**
 * Placeholder shell, mirroring apps/web's home page. It exists to prove the
 * wiring: the same actor resolution, the same shared packages, the same tokens.
 */
export default function HomeScreen() {
  const colors = colorsFor(useColorScheme());
  const [actor, setActor] = useState<MaybeActor | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveActor().then((resolved) => {
      if (!cancelled) setActor(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Relayflow</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {actor === null
          ? 'Checking session…'
          : isAuthenticated(actor)
            ? `Signed in as ${actor.email} · ${actor.memberships.length} workspace(s)`
            : 'Not signed in.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[6],
  },
  title: { fontSize: fontSize['3xl'], fontWeight: '600' },
  body: { fontSize: fontSize.base, textAlign: 'center' },
});
