import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { isAuthenticated } from '@relayflow/access';
import type { Organization } from '@relayflow/entities';
import { listOrganizations } from '@relayflow/logic';
import { colorsFor, fontSize, radius, space } from '@relayflow/tokens';
import { createContext, resolveActor } from '../src/session';

/**
 * Placeholder shell, mirroring apps/web's home page: same use-case, same
 * policy, same tokens, different renderer.
 */
export default function HomeScreen() {
  const colors = colorsFor(useColorScheme());
  const actor = resolveActor();
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listOrganizations(createContext(), {}).then((result) => {
      if (!cancelled) setOrganizations(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Relayflow</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {isAuthenticated(actor) ? `Acting as ${actor.email}` : 'Signed out.'}
      </Text>

      {organizations?.map((organization) => (
        <View
          key={organization.id}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text numberOfLines={1} style={[styles.rowText, { color: colors.textPrimary }]}>
            {organization.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: space[3],
    padding: space[6],
  },
  title: { fontSize: fontSize['3xl'], fontWeight: '600' },
  body: { fontSize: fontSize.base },
  row: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowText: { fontSize: fontSize.base, fontWeight: '500' },
});
