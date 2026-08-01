import { redirect } from 'next/navigation';

export default async function StartupCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  redirect(`/startup/cycles/${cycleId}/allocation`);
}
