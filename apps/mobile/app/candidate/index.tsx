import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { CandidateOverview } from '@relayflow/logic';
import { getCandidateOverview } from '@relayflow/logic';
import { fontSize, fontWeight, radius, space } from '@relayflow/tokens';
import { Badge, Body, Button, Caption, Card, CardHeader, EmptyState, Heading, useColors } from '@relayflow/ui-native';
import { createContext } from '../../src/session';
import { AvailabilityPrompt } from '../../src/availability';
import { JourneyList } from '../../src/journey';

/**
 * The candidate's screen on a phone.
 *
 * Same use-case as the web, same journey, same next action — but the whole
 * thing is one scrolling column, because this is where a candidate actually is
 * when the email arrives. The document camera flow is the reason this portal
 * belongs on mobile at all.
 */
export default function CandidateScreen() {
  const colors = useColors(useColorScheme());
  const router = useRouter();
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await getCandidateOverview(createContext(), {});
    if (result.ok) {
      setOverview(result.data);
      setError(null);
    } else {
      setError(result.error.message);
    }
  }, []);

  // Reload on focus so a decision made on another screen is reflected here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error) {
    return (
      <View style={styles.screen}>
        <Card colors={colors}>
          <EmptyState colors={colors}>{error}</EmptyState>
        </Card>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.screen}>
        <Caption colors={colors}>Loading…</Caption>
      </View>
    );
  }

  const { candidate, placement } = overview;
  const needsAvailability = candidate.availability === 'unconfirmed';
  const firstName = candidate.fullName.split(' ')[0] ?? candidate.fullName;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.textMuted} />}
    >
      <View style={styles.header}>
        <Heading colors={colors}>Hello, {firstName}</Heading>
        <Caption colors={colors}>Your internship application with QSTP.</Caption>
      </View>

      {needsAvailability ? (
        <AvailabilityPrompt current={candidate.availability} onDone={load} />
      ) : (
        overview.action && (
          <View style={[styles.cta, { backgroundColor: colors.accent }]}>
            <Text style={[styles.ctaLabel, { color: colors.accentText }]}>NEXT STEP</Text>
            <Text style={[styles.ctaTitle, { color: colors.accentText }]}>
              {overview.action.label}
            </Text>
            <View style={styles.ctaButton}>
              <Button
                colors={colors}
                label="Continue"
                variant="secondary"
                onPress={() =>
                  router.push(
                    overview.action?.href.includes('documents')
                      ? '/candidate/documents'
                      : '/candidate',
                  )
                }
              />
            </View>
          </View>
        )
      )}

      {placement && (
        <Card colors={colors} padded={false}>
          <CardHeader
            colors={colors}
            title="Your placement"
            aside={
              <Badge colors={colors} tone={placement.selection.status === 'confirmed' ? 'positive' : 'info'}>
                {placement.selection.status === 'confirmed' ? 'confirmed' : 'reserved'}
              </Badge>
            }
          />
          <View style={styles.placement}>
            <Body colors={colors}>{placement.position?.title ?? 'Internship'}</Body>
            <Caption colors={colors}>{placement.startup?.name ?? 'A QSTP startup'}</Caption>
            {placement.position && (
              <Caption colors={colors}>
                {placement.position.hoursPerIntern} hours a week · {placement.position.durationWeeks}{' '}
                weeks
              </Caption>
            )}
          </View>
        </Card>
      )}

      <Card colors={colors} padded={false}>
        <CardHeader colors={colors} title="Your progress" />
        <View style={styles.journey}>
          <JourneyList steps={overview.journey} />
        </View>
      </Card>

      <Button
        colors={colors}
        label={
          overview.documentsOutstanding > 0
            ? `Documents (${overview.documentsOutstanding} to do)`
            : 'View documents'
        }
        onPress={() => router.push('/candidate/documents')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space[4] },
  content: { padding: space[4], gap: space[4] },
  header: { gap: space[1] },
  cta: { borderRadius: radius.lg, padding: space[4], gap: space[2] },
  ctaLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.8, opacity: 0.85 },
  ctaTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  ctaButton: { marginTop: space[1] },
  placement: { padding: space[4], gap: space[1] },
  journey: { padding: space[4] },
});
