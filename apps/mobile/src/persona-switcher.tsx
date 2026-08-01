import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { colorsFor, fontSize, fontWeight, radius, space } from '@relayflow/tokens';
import { MOBILE_PERSONAS, getActingAs, portalFor, resolveActor, setActingAs, subscribeToActor } from './session';

const LABEL: Record<string, string> = {
  candidate: 'Layla',
  startupOwner: 'Acme',
  lateStartup: 'Northwind',
};

/**
 * Dev-only persona switch, in the header.
 *
 * Same purpose as the web one: checking that the interface genuinely differs by
 * who is looking should take two seconds, not a rebuild. Disappears with the
 * fixtures.
 */
export function PersonaSwitcher() {
  const colors = colorsFor(useColorScheme());
  const router = useRouter();
  const current = useSyncExternalStore(subscribeToActor, getActingAs, getActingAs);

  return (
    <View style={[styles.group, { backgroundColor: colors.surfaceSunken }]}>
      {MOBILE_PERSONAS.map((persona) => {
        const active = current === persona;
        return (
          <Pressable
            key={persona}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              setActingAs(persona);
              // Switching persona can change which portal applies, so route
              // rather than just re-render.
              const portal = portalFor(resolveActor());
              router.replace(portal === 'startup' ? '/startup' : '/candidate');
            }}
            style={[styles.chip, active && { backgroundColor: colors.surface }]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {LABEL[persona] ?? persona}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: radius.md },
  chip: { paddingHorizontal: space[2], paddingVertical: space[1], borderRadius: radius.sm },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
