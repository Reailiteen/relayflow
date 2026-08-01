import { redirect } from 'next/navigation';
import { isStartup } from '@relayflow/access';
import { getStartupHome } from '@relayflow/logic';
import { getActor, getContext } from '@/server/context';
import { StartupHeading, StartupSidebar } from './_components/nav';
import { PortalSwitcher } from './_components/portal-switcher';

/**
 * The startup shell.
 *
 * As with QSTP, the redirect is convenience rather than security — the real
 * protection is in the use-cases, which authorize on every call regardless of
 * the route taken.
 */
export default async function StartupLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isStartup(actor)) redirect('/signin');

  const ctx = await getContext();
  const home = await getStartupHome(ctx, {});
  const startupName = home.ok ? home.data.startupName : 'Your startup';

  return (
    <div className="flex h-dvh bg-background">
      <StartupSidebar startupName={startupName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
          <StartupHeading />
          <div className="ml-auto flex items-center gap-2">
            <PortalSwitcher />
            <span className="hidden text-xs text-text-muted sm:inline">{actor.fullName}</span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
