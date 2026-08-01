import Link from 'next/link';
import { EmptyState, Panel, PanelHeader } from '@relayflow/ui-web';

/**
 * Placeholder for a section that exists in the product shape but has not been
 * built. Shown rather than hidden so the demo makes the whole system legible,
 * and so nobody mistakes an unbuilt screen for a broken one.
 */
export function NotBuiltYet({ section }: { section: string }) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-3">
      <h1 className="text-lg font-semibold tracking-tight">{section}</h1>
      <Panel>
        <PanelHeader title={section} />
        <EmptyState>
          Not built yet.{' '}
          <Link href="/" className="text-accent underline-offset-2 hover:underline">
            Back to the dashboard
          </Link>
        </EmptyState>
      </Panel>
    </div>
  );
}
