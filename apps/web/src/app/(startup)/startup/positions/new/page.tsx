import { getStartupPositions } from '@relayflow/logic';
import { redirect } from 'next/navigation';
import { EmptyState, Panel } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { NewPositionForm } from './_form';

export const metadata = { title: 'New position' };

export default async function NewPositionPage() {
  const ctx = await getContext();
  const activeCycle = await ctx.repos.cycles.findActive();
  if (activeCycle.ok && activeCycle.data) {
    redirect(`/startup/cycles/${activeCycle.data.id}/positions`);
  }
  const result = await getStartupPositions(ctx, {});

  if (!result.ok) {
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel>
          <EmptyState>{result.error.message}</EmptyState>
        </Panel>
      </div>
    );
  }

  const { allocatedHours, usedHours } = result.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      {allocatedHours === 0 ? (
        <Panel>
          <EmptyState>
            You have not been allocated hours this cycle, so there is nothing to submit against.
          </EmptyState>
        </Panel>
      ) : (
        <NewPositionForm allocatedHours={allocatedHours} usedHours={usedHours} />
      )}
    </div>
  );
}
