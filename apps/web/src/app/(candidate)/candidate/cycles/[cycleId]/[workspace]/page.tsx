import { renderCycleWorkspace } from '@/app/_components/render-cycle-workspace';

export default async function CandidateCycleWorkspacePage({ params }: { params: Promise<{ cycleId: string; workspace: string }> }) {
  const { cycleId, workspace } = await params;
  return renderCycleWorkspace(cycleId, workspace, 'candidate');
}
