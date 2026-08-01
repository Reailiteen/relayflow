import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { CandidateDocumentView } from '@relayflow/logic';
import { confirmDocumentFields, getCandidateDocuments, uploadDocument } from '@relayflow/logic';
import { fontSize, fontWeight, radius, space } from '@relayflow/tokens';
import { Badge, Body, Button, Caption, Card, CardHeader, EmptyState, useColors } from '@relayflow/ui-native';
import { createContext } from '../../src/session';

const KIND_LABEL: Record<string, string> = {
  national_id: 'Qatar ID',
  passport: 'Passport',
  bank_statement: 'Bank statement',
  qstp_contract: 'QSTP contract',
  startup_nda: 'Startup NDA',
  other: 'Document',
};

const STATUS_TONE = {
  requested: 'warning',
  uploaded: 'info',
  extracting: 'info',
  awaiting_candidate_review: 'warning',
  submitted: 'info',
  verified: 'positive',
  rejected: 'critical',
} as const;

const STATUS_LABEL: Record<string, string> = {
  requested: 'needed',
  uploaded: 'uploaded',
  extracting: 'reading',
  awaiting_candidate_review: 'check details',
  submitted: 'with QSTP',
  verified: 'verified',
  rejected: 'needs fixing',
};

/**
 * Documents on a phone.
 *
 * This is the flow that justifies a mobile app at all: the candidate is holding
 * their ID and photographing it. Upload leads, the extracted fields come back
 * as editable inputs, and nothing is sent until each one is confirmed — same
 * contract as the web, but the review step is a form you can thumb through.
 */
export default function DocumentsScreen() {
  const colors = useColors(useColorScheme());
  const [views, setViews] = useState<CandidateDocumentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getCandidateDocuments(createContext(), {});
    if (result.ok) {
      setViews([...result.data].sort((a, b) => Number(b.needsAction) - Number(a.needsAction)));
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

  if (!views) {
    return (
      <View style={styles.screen}>
        <Caption colors={colors}>Loading…</Caption>
      </View>
    );
  }

  const outstanding = views.filter((view) => view.needsAction).length;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Caption colors={colors}>
        {outstanding === 0
          ? 'Everything is with QSTP. Nothing needs you right now.'
          : `${outstanding} document${outstanding === 1 ? '' : 's'} still needs you.`}
      </Caption>

      {views.length === 0 ? (
        <Card colors={colors}>
          <EmptyState colors={colors}>
            No documents requested yet. These appear once a startup has selected you.
          </EmptyState>
        </Card>
      ) : (
        views.map((view) => <DocumentCard key={view.document.id} view={view} onChange={load} />)
      )}
    </ScrollView>
  );
}

function DocumentCard({
  view,
  onChange,
}: {
  view: CandidateDocumentView;
  onChange: () => Promise<void>;
}) {
  const colors = useColors(useColorScheme());
  const { document } = view;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      document.fields.map((field) => [field.key, field.confirmed ?? field.extracted ?? '']),
    ),
  );

  const lowConfidence = new Set(view.lowConfidence);
  const reviewing = document.status === 'awaiting_candidate_review';

  const run = async (work: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    if (!result.ok) setError(result.message ?? 'Something went wrong.');
    setBusy(false);
    await onChange();
  };

  const upload = () =>
    run(async () => {
      // No camera wired up: there is no storage behind this yet, and faking a
      // file picker would be the one dishonest thing in the demo.
      const result = await uploadDocument(createContext(), {
        documentId: document.id,
        fileName: `${document.kind}-photo.jpg`,
      });
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    });

  const confirm = () =>
    run(async () => {
      const result = await confirmDocumentFields(createContext(), {
        documentId: document.id,
        fields: Object.entries(values).map(([key, value]) => ({ key, value })),
      });
      return result.ok ? { ok: true } : { ok: false, message: result.error.message };
    });

  return (
    <Card colors={colors} padded={false}>
      <CardHeader
        colors={colors}
        title={KIND_LABEL[document.kind] ?? 'Document'}
        aside={
          <Badge colors={colors} tone={STATUS_TONE[document.status]}>
            {STATUS_LABEL[document.status] ?? document.status}
          </Badge>
        }
      />

      <View style={styles.cardBody}>
        {document.status === 'rejected' && document.rejectionReason && (
          <View style={[styles.notice, { backgroundColor: colors.criticalSubtle }]}>
            <Text style={[styles.noticeText, { color: colors.criticalText }]}>
              QSTP needs this fixed. {document.rejectionReason}
            </Text>
          </View>
        )}

        {(document.status === 'requested' || document.status === 'rejected') && (
          <>
            <Caption colors={colors}>
              {document.kind === 'bank_statement'
                ? 'Photograph a statement showing your name and IBAN. Your salary is paid to this account.'
                : 'Photograph the whole document with all four corners visible.'}
            </Caption>
            <Button
              colors={colors}
              variant="primary"
              label="Take photo"
              busy={busy}
              onPress={() => void upload()}
            />
            <Caption colors={colors}>Demo: no file is stored. This simulates a scan.</Caption>
          </>
        )}

        {reviewing && (
          <>
            <View style={[styles.notice, { backgroundColor: colors.infoSubtle }]}>
              <Text style={[styles.noticeText, { color: colors.infoText }]}>
                We read these from your photo. Please check each one before sending.
              </Text>
            </View>

            {document.fields.map((field) => {
              const unsure = lowConfidence.has(field.key);
              return (
                <View key={field.key} style={styles.field}>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>{field.label}</Text>
                  <TextInput
                    value={values[field.key] ?? ''}
                    onChangeText={(text) =>
                      setValues((previous) => ({ ...previous, [field.key]: text }))
                    }
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={[
                      styles.input,
                      {
                        color: colors.textPrimary,
                        backgroundColor: colors.surface,
                        borderColor: unsure ? colors.warning : colors.border,
                      },
                    ]}
                  />
                  {unsure && (
                    <Text style={[styles.hint, { color: colors.warningText }]}>
                      We were not confident reading this — check it carefully.
                    </Text>
                  )}
                </View>
              );
            })}

            <Button
              colors={colors}
              variant="primary"
              label="Confirm and send"
              busy={busy}
              onPress={() => void confirm()}
            />
          </>
        )}

        {(document.status === 'submitted' || document.status === 'verified') && (
          <>
            <Body colors={colors} muted>
              {document.status === 'verified'
                ? 'Verified by QSTP.'
                : 'Sent to QSTP. Nothing more to do here.'}
            </Body>
            {document.fields.map((field) => (
              <View key={field.key} style={styles.summaryRow}>
                <Caption colors={colors}>{field.label}</Caption>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {field.confirmed ?? field.extracted}
                </Text>
              </View>
            ))}
          </>
        )}

        {error && <Text style={[styles.errorText, { color: colors.criticalText }]}>{error}</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space[4] },
  content: { padding: space[4], gap: space[4] },
  cardBody: { padding: space[4], gap: space[3] },
  notice: { borderRadius: radius.md, padding: space[3] },
  noticeText: { fontSize: fontSize.md, lineHeight: fontSize.md * 1.4 },
  field: { gap: space[1] },
  label: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    fontSize: fontSize.lg,
  },
  hint: { fontSize: fontSize.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  summaryValue: { fontSize: fontSize.md, flexShrink: 1 },
  errorText: { fontSize: fontSize.md },
});
