import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { PoolCandidate, StartupPools } from '@relayflow/logic';
import { getStartupPools, selectCandidate } from '@relayflow/logic';
import { isSelectable } from '@relayflow/entities';
import { fontSize, radius, space } from '@relayflow/tokens';
import { Badge, Body, Button, Caption, Card, CardHeader, EmptyState, useColors } from '@relayflow/ui-native';
import { createContext } from '../../src/session';

const AVAILABILITY: Record<string, { tone: 'neutral' | 'positive' | 'warning' | 'critical'; label: string }> = {
  available: { tone: 'positive', label: 'available' },
  unconfirmed: { tone: 'warning', label: 'not confirmed' },
  employed: { tone: 'critical', label: 'took another job' },
  not_interested: { tone: 'critical', label: 'not interested' },
  temporarily_unavailable: { tone: 'critical', label: 'unavailable' },
  placed: { tone: 'neutral', label: 'placed' },
};

/**
 * Reviewing and selecting candidates on a phone.
 *
 * The confirmation is a native Alert rather than a custom sheet: it is a
 * two-option decision, the platform dialog is what users expect, and it gets
 * accessibility and dismissal behaviour right for free.
 */
export default function StartupCandidatesScreen() {
  const colors = useColors(useColorScheme());
  const [pools, setPools] = useState<StartupPools | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getStartupPools(createContext(), {});
    if (result.ok) {
      setPools(result.data);
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

  if (!pools) {
    return (
      <View style={styles.screen}>
        <Caption colors={colors}>Loading…</Caption>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      {pools.pools.length === 0 ? (
        <Card colors={colors}>
          <EmptyState colors={colors}>
            No pools yet. QSTP shares candidates once your positions are approved.
          </EmptyState>
        </Card>
      ) : (
        pools.pools.map((pool) => (
          <Card key={pool.position.id} colors={colors} padded={false}>
            <CardHeader
              colors={colors}
              title={pool.position.title}
              aside={
                <Badge colors={colors} tone="neutral">{`${pool.candidates.length} in pool`}</Badge>
              }
            />
            {pool.candidates.length === 0 ? (
              <EmptyState colors={colors}>No candidates shared for this role yet.</EmptyState>
            ) : (
              pool.candidates.map((row, index) => (
                <CandidateRow
                  key={row.entry.id}
                  row={row}
                  positionId={pool.position.id}
                  last={index === pool.candidates.length - 1}
                  onChange={load}
                />
              ))
            )}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

function CandidateRow({
  row,
  positionId,
  last,
  onChange,
}: {
  row: PoolCandidate;
  positionId: string;
  last: boolean;
  onChange: () => Promise<void>;
}) {
  const colors = useColors(useColorScheme());
  const [busy, setBusy] = useState(false);
  const { candidate, selection, takenByOther } = row;
  const availability = AVAILABILITY[candidate.availability] ?? AVAILABILITY.unconfirmed;
  const selectable = isSelectable(candidate.availability) && !takenByOther && selection === null;

  const select = () => {
    Alert.alert(
      `Select ${candidate.fullName}?`,
      'They are reserved for you immediately. Candidates are first-come-first-served, so this can still be refused if another startup got there first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Select',
          style: 'default',
          onPress: () => {
            void (async () => {
              setBusy(true);
              const result = await selectCandidate(createContext(), {
                positionId,
                candidateId: candidate.id,
              });
              setBusy(false);
              if (!result.ok) Alert.alert('Could not select', result.error.message);
              await onChange();
            })();
          },
        },
      ],
    );
  };

  return (
    <View
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text
            style={[
              styles.name,
              { color: colors.textPrimary },
              !isSelectable(candidate.availability) && {
                textDecorationLine: 'line-through',
                color: colors.textMuted,
              },
            ]}
            numberOfLines={1}
          >
            {candidate.fullName}
          </Text>
          {selection ? (
            <Badge colors={colors} tone="positive">
              {selection.status === 'confirmed' ? 'confirmed' : 'reserved by you'}
            </Badge>
          ) : takenByOther ? (
            <Badge colors={colors} tone="neutral">taken</Badge>
          ) : (
            <Badge colors={colors} tone={availability?.tone ?? 'neutral'}>
              {availability?.label ?? 'unknown'}
            </Badge>
          )}
        </View>

        <Caption colors={colors}>{candidate.skills.join(' · ') || 'No skills listed'}</Caption>

        {row.interview?.aiSummary ? (
          <View style={[styles.summary, { backgroundColor: colors.surfaceSunken }]}>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
              {row.interview.aiSummary}
            </Text>
          </View>
        ) : null}
      </View>

      {selectable ? (
        <Button colors={colors} variant="primary" label="Select" busy={busy} onPress={select} />
      ) : takenByOther ? (
        <Body colors={colors} muted>
          —
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space[4] },
  content: { padding: space[4], gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
  rowMain: { flex: 1, minWidth: 0, gap: space[1] },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  name: { fontSize: fontSize.lg, fontWeight: '500', flexShrink: 1 },
  summary: { borderRadius: radius.md, padding: space[2] },
  summaryText: { fontSize: fontSize.md, lineHeight: fontSize.md * 1.4 },
});
