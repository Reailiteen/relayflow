import Link from 'next/link';
import {
  NotificationPreferencesPanel,
  ReminderRulesPanel,
} from '@/app/_components/notification-settings';
import { getActiveCycleName, getContext } from '@/server/context';

export const metadata = { title: 'Notification settings' };

/**
 * What the system says, and how this person hears it.
 *
 * Two panels because there are two decisions with two different owners: what
 * RelayFlow tells everybody is a programme decision, and how one person is
 * reached is theirs. Putting them on one page is a convenience; conflating them
 * would be a mistake.
 *
 * The rules panel renders nothing at all for anyone without `reminder:read`,
 * so the same route is safe for every portal to link to.
 */
export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle } = await searchParams;
  const ctx = await getContext();
  const active = await ctx.repos.cycles.findActive();
  const cycleId = cycle ?? null;
  const activeName = await getActiveCycleName();

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-[var(--rf-gap)] px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Notification settings</h1>
        <Link href="/notifications" className="text-xs text-accent underline-offset-2 hover:underline">
          Back to notifications
        </Link>
      </div>

      {/*
        Global by default. A cycle-specific override is a deliberate act — "this
        cycle is different" — and defaulting to it would mean somebody changing
        a setting for what they thought was the whole programme and changing it
        for one cycle instead.
      */}
      {active.ok && active.data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>Editing</span>
          <Link
            href="/notifications/settings"
            className={cycleId === null ? 'font-medium text-ink' : 'text-accent hover:underline'}
          >
            programme defaults
          </Link>
          <span>·</span>
          <Link
            href={`/notifications/settings?cycle=${active.data.id}`}
            className={cycleId !== null ? 'font-medium text-ink' : 'text-accent hover:underline'}
          >
            {activeName ?? 'the active cycle'} only
          </Link>
        </div>
      )}

      <ReminderRulesPanel cycleId={cycleId} />
      <NotificationPreferencesPanel />
    </div>
  );
}
