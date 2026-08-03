import Link from 'next/link';
import { NotificationPreferencesPanel } from '@/app/_components/notification-settings';

export const metadata = { title: 'Notification settings' };

/**
 * A startup member's own channel choices.
 *
 * No rules panel: configuring what the programme says to everybody is QSTP's,
 * and `listReminderRules` would refuse anyway. Omitting it rather than
 * rendering a refusal is the point — a permission you do not have is not
 * information you need.
 */
export default function StartupNotificationSettingsPage() {
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Notification settings</h1>
        <Link
          href="/startup/notifications"
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          Back to notifications
        </Link>
      </div>

      <p className="max-w-prose text-sm text-text-secondary">
        Choose how you hear about each kind of update. Deadline notices and the in-app record
        cannot be switched off — they are what the programme relies on to show you were told.
      </p>

      <NotificationPreferencesPanel />
    </div>
  );
}
