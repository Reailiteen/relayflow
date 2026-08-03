import { NotificationCenter, filterFromSearchParams } from '@/app/_components/notifications';

export const metadata = { title: 'Notifications' };

/**
 * QSTP's inbox.
 *
 * Staff receive the widest range of categories — deadlines, conflicts,
 * exceptions, documents awaiting verification, and the engine's own run
 * reports — so this is the page the six-category treatment has to survive.
 */
export default async function QstpNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  return (
    <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <NotificationCenter filter={filterFromSearchParams(filter)} basePath="/notifications" />
    </div>
  );
}
