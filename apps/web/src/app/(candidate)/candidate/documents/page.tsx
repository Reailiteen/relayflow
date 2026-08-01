import { getCandidateDocuments } from '@relayflow/logic';
import { EmptyState, Panel } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { DocumentCard } from './_document';

export const metadata = { title: 'Documents' };

/**
 * Documents, with whatever needs the candidate's attention first.
 *
 * A student with one rejected document and three verified ones should not have
 * to scan a list to find the one that matters.
 */
export default async function CandidateDocumentsPage() {
  const ctx = await getContext();
  const result = await getCandidateDocuments(ctx, {});

  if (!result.ok) {
    return (
      <Panel>
        <EmptyState>{result.error.message}</EmptyState>
      </Panel>
    );
  }

  const views = [...result.data].sort((a, b) => Number(b.needsAction) - Number(a.needsAction));
  const outstanding = views.filter((view) => view.needsAction).length;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-0.5 text-base text-text-muted">
          {outstanding === 0
            ? 'Everything is with QSTP. Nothing needs you right now.'
            : `${outstanding} document${outstanding === 1 ? '' : 's'} still needs you.`}
        </p>
      </header>

      {views.length === 0 ? (
        <Panel>
          <EmptyState>
            No documents requested yet. These appear once a startup has selected you.
          </EmptyState>
        </Panel>
      ) : (
        views.map((view) => <DocumentCard key={view.document.id} view={view} />)
      )}
    </div>
  );
}
