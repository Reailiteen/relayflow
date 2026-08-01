import { redirect } from 'next/navigation';

export default async function CandidateCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  redirect(`/candidate/cycles/${cycleId}/selection`);
}
