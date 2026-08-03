import Link from 'next/link';
import { NotificationPreferencesPanel } from '@/app/_components/notification-settings';

export const metadata = { title: 'Notification settings' };

/**
 * A candidate's own channel choices.
 *
 * Slack appears in the grid and will never deliver: candidates have no
 * workspace, and `fanout_reminder_step` skips the channel when there is no
 * active target. Showing the row anyway is the lesser of two evils — a grid
 * that differs by who is looking at it invites the question of what else
 * differs — and the toggle is honest about being a preference rather than a
 * promise.
 */
export default function CandidateNotificationSettingsPage() {
  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Notification settings</h1>
        <Link
          href="/candidate/notifications"
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          Back to notifications
        </Link>
      </div>

      <p className="max-w-prose text-sm text-text-secondary">
        Choose how you hear about interviews, offers and paperwork. Anything with a deadline
        attached stays on — those are the messages that cost you a placement if you miss them.
      </p>

      <NotificationPreferencesPanel />
    </div>
  );
}
