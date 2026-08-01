import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { StartupHome } from '@relayflow/logic';
import { getStartupHome } from '@relayflow/logic';
import { fontSize, fontWeight, radius, space } from '@relayflow/tokens';
import { Badge, Body, Button, Caption, Card, CardHeader, EmptyState, Heading, Row, useColors } from '@relayflow/ui-native';
import { createContext } from '../../src/session';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The startup's screen on a phone.
 *
 * Same "your next action" model as the web, and the same reasoning: a founder
 * checking on their phone between meetings wants one instruction, not a
 * dashboard. Reviewing candidates is the one job that genuinely works on a
 * small screen, so it is the only deep link.
 */
export default function StartupScreen() {
  const colors = useColors(useColorScheme());
  const router = useRouter();
  const [home, setHome] = useState<StartupHome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getStartupHome(createContext(), {});
    if (result.ok) {
      setHome(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error) {
    return (
      <View style={styles.screen}>
        <Card colors={colors}>
          <EmptyState colors={colors}>{error}</EmptyState>
        </Card>
      </View>
    );
  }

  if (!home) {
    return (
      <View style={styles.screen}>
        <Caption colors={colors}>Loading…</Caption>
      </View>
    );
  }

  const { nextAction } = home;
  const done = nextAction.kind === 'nothing';

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Heading colors={colors}>{home.startupName}</Heading>
        <Caption colors={colors}>{home.cycleName}</Caption>
      </View>

      <View
        style={[
          styles.cta,
          {
            backgroundColor: done
              ? colors.positiveSubtle
              : nextAction.urgent
                ? colors.criticalSubtle
                : colors.surface,
            borderColor: done
              ? colors.positive
              : nextAction.urgent
                ? colors.critical
                : colors.border,
          },
        ]}
      >
        <Text style={[styles.ctaLabel, { color: colors.textMuted }]}>YOUR NEXT ACTION</Text>
        <Text style={[styles.ctaTitle, { color: colors.textPrimary }]}>{nextAction.headline}</Text>
        <Text style={[styles.ctaDetail, { color: colors.textSecondary }]}>{nextAction.detail}</Text>
        {nextAction.deadline && (
          <Text style={[styles.ctaDeadline, { color: colors.textMuted }]}>
            Selection deadline {date(nextAction.deadline)}
          </Text>
        )}
        {!done && (
          <View style={styles.ctaButton}>
            <Button
              colors={colors}
              variant="primary"
              label="Review candidates"
              onPress={() => router.push('/startup/candidates')}
            />
          </View>
        )}
      </View>

      <Card colors={colors} padded={false}>
        <CardHeader
          colors={colors}
          title="Your hours"
          aside={<Badge colors={colors} tone="neutral">{`${home.allocatedHours}h / week`}</Badge>}
        />
        <Row colors={colors} title="Used by roles" right={<Body colors={colors}>{String(home.usedHours)}</Body>} />
        <Row colors={colors} title="Remaining" right={<Body colors={colors}>{String(home.remainingHours)}</Body>} />
        <Row
          colors={colors}
          title="Interns selected"
          right={<Body colors={colors}>{String(home.selectionsMade)}</Body>}
          last
        />
      </Card>

      <Button
        colors={colors}
        label={
          home.candidatesAwaitingReview > 0
            ? `Candidates (${home.candidatesAwaitingReview} to review)`
            : 'View candidates'
        }
        onPress={() => router.push('/startup/candidates')}
      />

      <Caption colors={colors}>
        Positions, interviews and deadline extensions are on the web portal.
      </Caption>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space[4] },
  content: { padding: space[4], gap: space[4] },
  header: { gap: space[1] },
  cta: { borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[1.5] },
  ctaLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.8 },
  ctaTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  ctaDetail: { fontSize: fontSize.md, lineHeight: fontSize.md * 1.4 },
  ctaDeadline: { fontSize: fontSize.md },
  ctaButton: { marginTop: space[2] },
});
