import { notFound } from 'next/navigation';
import { cycleId } from '@relayflow/entities';
import { getCycleWorkspace } from '@relayflow/logic';
import { EmptyState, Panel } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { CycleWorkspaceView, type Portal, type Workspace } from './cycle-workspace';

const WORKSPACES: readonly Workspace[] = [
  'allocation',
  'positions',
  'selection',
  'recovery',
  'placements',
  'activity',
];

export async function renderCycleWorkspace(cycle: string, workspace: string, portal: Portal) {
  const parsedCycle = cycleId.safeParse(cycle);
  if (!parsedCycle.success || !WORKSPACES.includes(workspace as Workspace)) notFound();
  if (portal !== 'qstp' && (workspace === 'recovery' || workspace === 'activity')) notFound();

  const result = await getCycleWorkspace(await getContext(), { cycleId: parsedCycle.data });
  if (!result.ok) {
    if (result.error.code === 'not_found') notFound();
    return (
      <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)]">
        <Panel><EmptyState>{result.error.message}</EmptyState></Panel>
      </div>
    );
  }
  return <CycleWorkspaceView data={result.data} portal={portal} workspace={workspace as Workspace} />;
}
