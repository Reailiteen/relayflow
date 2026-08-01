import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { JourneyStepView } from '@relayflow/logic';
import { colorsFor, fontSize, fontWeight, radius, space } from '@relayflow/tokens';

/**
 * The journey stepper, native.
 *
 * Same five steps and same states as the web version, drawn with views rather
 * than borrowed markup. The connector is a plain 2px bar — on a phone the web
 * version's hairline would disappear entirely at typical brightness.
 */
export function JourneyList({ steps }: { steps: readonly JourneyStepView[] }) {
  const colors = colorsFor(useColorScheme());

  return (
    <View>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const done = step.state === 'done';
        const current = step.state === 'current';
        const blocked = step.state === 'blocked';

        const dotColor = done
          ? colors.positive
          : current
            ? colors.accent
            : blocked
              ? colors.textMuted
              : colors.border;

        return (
          <View key={step.step} style={styles.step}>
            <View style={styles.gutter}>
              <View style={[styles.dot, { backgroundColor: dotColor }]}>
                {done && <Text style={[styles.tick, { color: colors.textInverse }]}>✓</Text>}
              </View>
              {!last && (
                <View
                  style={[styles.line, { backgroundColor: done ? colors.positive : colors.border }]}
                />
              )}
            </View>

            <View style={[styles.body, last && { paddingBottom: 0 }]}>
              <View style={styles.titleRow}>
                <Text
                  style={[
                    styles.title,
                    { color: current ? colors.textPrimary : colors.textSecondary },
                    current && { fontWeight: fontWeight.semibold },
                  ]}
                >
                  {step.label}
                </Text>
                {current && (
                  <View style={[styles.here, { backgroundColor: colors.accentSubtle }]}>
                    <Text style={[styles.hereText, { color: colors.accent }]}>YOU ARE HERE</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.summary, { color: colors.textMuted }]}>{step.summary}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space[3] },
  gutter: { alignItems: 'center', width: 24 },
  dot: { width: 20, height: 20, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  tick: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  line: { width: 2, flex: 1, marginVertical: 2 },
  body: { flex: 1, paddingBottom: space[5], gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.medium },
  here: { paddingHorizontal: space[1.5], paddingVertical: 2, borderRadius: radius.sm },
  hereText: { fontSize: fontSize['2xs'], fontWeight: fontWeight.semibold, letterSpacing: 0.5 },
  summary: { fontSize: fontSize.md, lineHeight: fontSize.md * 1.4 },
});
