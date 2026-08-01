import { notFound } from 'next/navigation';
import { cycleId } from '@relayflow/entities';
import { getCycleWorkspace } from '@relayflow/logic';
import { EmptyState, Panel } from '@relayflow/ui-web';
import { getContext } from '@/server/context';
import { CycleWorkspaceView, PORTAL_WORKSPACES, type Portal, type Workspace } from './cycle-workspace';

export async function renderCycleWorkspace(cycle: string, workspace: string, portal: Portal) {
  const parsedCycle = cycleId.safeParse(cycle);
  // One list, shared with the nav, so a tab can never point at a route that
  // 404s and a guessed URL can never reach a workspace the nav hides. The old
  // pair of checks had drifted: the startup nav rendered a Recovery tab that the
  // route then refused.
  if (!parsedCycle.success || !PORTAL_WORKSPACES[portal].includes(workspace as Workspace)) {
    notFound();
  }

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
