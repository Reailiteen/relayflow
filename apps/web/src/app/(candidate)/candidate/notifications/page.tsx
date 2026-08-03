import { NotificationCenter, filterFromSearchParams } from '@/app/_components/notifications';

export const metadata = { title: 'Notifications' };

/**
 * A candidate's inbox.
 *
 * No outer padding here: the candidate shell already centres a column and adds
 * its own gutters, and a second wrapper would double them on a phone, which is
 * where nearly all of this portal's traffic is.
 */
export default async function CandidateNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  return (
    <NotificationCenter
      filter={filterFromSearchParams(filter)}
      basePath="/candidate/notifications"
    />
  );
}
