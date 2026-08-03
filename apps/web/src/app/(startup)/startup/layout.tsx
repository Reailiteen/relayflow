import { redirect } from 'next/navigation';
import { isStartup } from '@relayflow/access';
import { getStartupHome } from '@relayflow/logic';
import { getActor, getContext } from '@/server/context';
import { RailProvider } from '@/app/_components/rail';
import { AccountMenu } from '@/app/_components/account';
import { NotificationBell } from '@/app/_components/notifications';
import { TopBar, Workspace } from '@/app/_components/shell';
import { StartupHeading, StartupNavToggle, StartupSidebar } from './_components/nav';
import { PortalSwitcher } from './_components/portal-switcher';

/**
 * The startup shell.
 *
 * The same furniture as QSTP — rail, 70px top bar, account block — because a
 * startup owner who has been walked through the QSTP screens should not have to
 * learn a second interface. What differs is the section list and the fact that
 * everything here is scoped to one company.
 *
 * As with QSTP, the redirect is convenience rather than security: the real
 * protection is in the use-cases, which authorize on every call regardless of
 * the route taken.
 */
export default async function StartupLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isStartup(actor)) redirect('/signin');

  const ctx = await getContext();
  const home = await getStartupHome(ctx, {});
  const startupName = home.ok ? home.data.startupName : 'Your startup';
  const activeCycle = await ctx.repos.cycles.findActive();
  const cycleId = activeCycle.ok && activeCycle.data ? activeCycle.data.id : 'c1c1e000-0000-4000-8000-000000000001';

  return (
    <RailProvider>
      <div className="flex h-dvh bg-canvas">
        <StartupSidebar startupName={startupName} cycleId={cycleId} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar>
            <StartupNavToggle startupName={startupName} cycleId={cycleId} />
            <StartupHeading cycleId={cycleId} />

            <div className="ml-auto flex items-center gap-4">
              <PortalSwitcher />
              <NotificationBell centerHref="/startup/notifications" />
              <AccountMenu name={actor.fullName} detail={startupName} />
            </div>
          </TopBar>

          <Workspace>{children}</Workspace>
        </div>
      </div>
    </RailProvider>
  );
}
