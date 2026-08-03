import { redirect } from 'next/navigation';
import { isQstp } from '@relayflow/access';
import { getActor, getContext } from '@/server/context';
import { RailProvider } from '@/app/_components/rail';
import { AccountMenu } from '@/app/_components/account';
import { NotificationBell } from '@/app/_components/notifications';
import { TopBar, Workspace } from '@/app/_components/shell';
import { QstpHeading, QstpNavToggle, QstpSidebar } from './_components/nav';
import { ActorSwitcher } from './_components/actor-switcher';

/**
 * The QSTP shell: a permanent rail beside a scrolling work area.
 *
 * A route group per portal — (qstp), (startup), (candidate) — because the three
 * audiences need genuinely different chrome while sharing one system underneath.
 *
 * The redirect here is convenience, not security: it puts people in the right
 * place rather than showing them an error. The actual protection is in the
 * use-cases, which authorize on every call regardless of the route taken.
 */

export default async function QstpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isQstp(actor)) redirect('/signin');

  const ctx = await getContext();
  const activeCycle = await ctx.repos.cycles.findActive();
  const cycleId = activeCycle.ok && activeCycle.data ? activeCycle.data.id : 'c1c1e000-0000-4000-8000-000000000001';

  return (
    <RailProvider>
      <div className="flex h-dvh bg-canvas">
        <QstpSidebar cycleId={cycleId} />

        {/* min-w-0 so wide tables scroll inside the work area rather than
            stretching the whole page and pushing the rail off screen. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar>
            <QstpNavToggle cycleId={cycleId} />
            <QstpHeading cycleId={cycleId} />

            <div className="ml-auto flex items-center gap-4">
              <ActorSwitcher current={actor.role} />
              <NotificationBell centerHref="/notifications" />
              <AccountMenu name={actor.fullName} detail={actor.email} />
            </div>
          </TopBar>

          <Workspace>{children}</Workspace>
        </div>
      </div>
    </RailProvider>
  );
}
