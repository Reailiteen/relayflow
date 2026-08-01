import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { getStartupOnboarding } from '@relayflow/logic';
import { Badge, EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';
import { getContext } from '@/server/context';

export const metadata = { title: 'Documents' };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Onboarding, as much of it as a startup is entitled to see.
 *
 * A supervisor needs to know whether their intern can start on Monday. They do
 * not need that person's national ID number or bank details, and this screen
 * cannot show them — the read model returns counts and states, with no field
 * data in it to leak. The only document rendered in full is the startup's own
 * NDA.
 *
 * That constraint is stated on the screen too, because a startup that cannot
 * find the passport scan should understand it is a decision rather than a
 * missing feature.
 */
export default async function StartupDocumentsPage() {
  const ctx = await getContext();
  const result = await getStartupOnboarding(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { interns, documentDeadline } = result.data;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <p className="text-sm text-text-muted">
        Documents are due {date(documentDeadline)}. QSTP verifies them.
      </p>

      {interns.length === 0 ? (
        <Panel>
          <PanelHeader title="Your interns" />
          <EmptyState>
            No confirmed interns yet. Onboarding starts once a candidate accepts their placement.
          </EmptyState>
        </Panel>
      ) : (
        interns.map((intern) => (
          <Panel key={intern.candidate.id}>
            <PanelHeader
              title={intern.candidate.fullName}
              aside={
                intern.readyToStart ? (
                  <Badge tone="positive">ready to start</Badge>
                ) : (
                  <Badge tone="warning">{intern.documentsOutstanding} outstanding</Badge>
                )
              }
            />

            <div className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <span className="font-medium text-text">{intern.position?.title ?? 'Role'}</span>
                <a href={`mailto:${intern.candidate.email}`} className="text-accent hover:underline">
                  {intern.candidate.email}
                </a>
              </div>

              {/* Progress, not contents. */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-positive transition-[width]"
                    style={{
                      width: `${
                        intern.documentsTotal === 0
                          ? 0
                          : Math.round((intern.documentsVerified / intern.documentsTotal) * 100)
                      }%`,
                    }}
                  />
                </div>
                <span className="shrink-0 text-sm tabular-nums text-text-muted">
                  {intern.documentsVerified} of {intern.documentsTotal} verified
                </span>
              </div>

              {intern.readyToStart && (
                <p className="flex items-center gap-1.5 text-sm text-positive-text">
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  QSTP has verified everything. They are cleared to start.
                </p>
              )}

              {/* The one document this startup owns. */}
              <div className="rounded-md bg-surface-sunken px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-text-muted">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Your NDA
                </span>
                {intern.nda ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
                    <FileText className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    <span>{intern.nda.fileName ?? 'Not uploaded yet'}</span>
                    <Badge
                      tone={
                        intern.nda.status === 'verified'
                          ? 'positive'
                          : intern.nda.status === 'requested'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {intern.nda.status.replace(/_/g, ' ')}
                    </Badge>
                  </p>
                ) : (
                  <p className="mt-1 text-base text-text-muted">
                    No NDA requested for this intern.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        ))
      )}

      <p className="px-1 text-xs text-text-muted">
        You can see whether your intern&rsquo;s paperwork is complete, but not what is in it. IDs and
        bank details go to QSTP only.
      </p>
    </div>
  );
}
