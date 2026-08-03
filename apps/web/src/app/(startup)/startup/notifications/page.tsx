import { NotificationCenter, filterFromSearchParams } from '@/app/_components/notifications';

export const metadata = { title: 'Notifications' };

/**
 * A startup's inbox.
 *
 * Scoped to the person, not the company: two people at the same startup have
 * different inboxes because the reminder engine fans out per recipient. This
 * page shows the reader's own rows and never their colleague's.
 */
export default async function StartupNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;

  return (
    <div className="px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <NotificationCenter
        filter={filterFromSearchParams(filter)}
        basePath="/startup/notifications"
      />
    </div>
  );
}
