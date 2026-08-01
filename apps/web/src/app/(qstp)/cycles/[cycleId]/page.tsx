import { redirect } from 'next/navigation';

export default async function CyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  redirect(`/cycles/${cycleId}/allocation`);
}
