import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { confirmAvailability } from '@relayflow/logic';
import { colorsFor, fontSize, fontWeight, radius, space } from '@relayflow/tokens';
import { Card, CardHeader } from '@relayflow/ui-native';
import { createContext } from './session';

/**
 * "Are you still available?" — four large targets and nothing else.
 *
 * On mobile this is the strongest argument for the portal existing: a candidate
 * gets a push or an email, taps once, and the programme's most expensive stale
 * data problem is solved. The negative answers are as easy to reach as the
 * positive one, deliberately.
 */
const OPTIONS = [
  { value: 'available', label: "Yes, I'm available", detail: 'Keep me in the running.' },
  { value: 'employed', label: "I've taken another job", detail: 'Remove me from consideration.' },
  { value: 'not_interested', label: 'No longer interested', detail: "I'd rather not continue." },
  { value: 'temporarily_unavailable', label: 'Not right now', detail: 'Ask me again next cycle.' },
] as const;

export function AvailabilityPrompt({
  current,
  onDone,
}: {
  current: string;
  onDone: () => void | Promise<void>;
}) {
  const colors = colorsFor(useColorScheme());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (status: string) => {
    setBusy(status);
    setError(null);
    const result = await confirmAvailability(createContext(), { status, note: null });
    if (!result.ok) setError(result.error.message);
    setBusy(null);
    await onDone();
  };

  return (
    <Card colors={colors} padded={false}>
      <CardHeader colors={colors} title="Are you still available?" />
      <View style={styles.list}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: current === option.value, busy: busy === option.value }}
            disabled={busy !== null}
            onPress={() => void confirm(option.value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: current === option.value ? colors.accentSubtle : colors.surface,
                borderColor: current === option.value ? colors.accent : colors.border,
                opacity: busy === option.value ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{option.label}</Text>
            <Text style={[styles.optionDetail, { color: colors.textMuted }]}>{option.detail}</Text>
          </Pressable>
        ))}
        {error && <Text style={[styles.error, { color: colors.criticalText }]}>{error}</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { padding: space[4], gap: space[2] },
  option: { minHeight: 56, borderWidth: 1, borderRadius: radius.md, padding: space[3], gap: 2 },
  optionLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
  optionDetail: { fontSize: fontSize.md },
  error: { fontSize: fontSize.md },
});
