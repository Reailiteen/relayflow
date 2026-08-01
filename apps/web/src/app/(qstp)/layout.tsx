import { redirect } from 'next/navigation';
import { isQstp } from '@relayflow/access';
import { getActiveCycleName, getActor } from '@/server/context';
import { CurrentSection, QstpMobileNav, QstpSidebar } from './_components/nav';
import { ActorSwitcher } from './_components/actor-switcher';
import { UserMenu } from '../_components/user-menu';

/**
 * The QSTP shell: a permanent sidebar beside a scrolling work area.
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

  const cycleName = await getActiveCycleName();

  return (
    <div className="flex h-dvh bg-background">
      <QstpSidebar {...(cycleName ? { cycleName } : {})} />

      {/* min-w-0 so wide tables scroll inside the work area rather than
          stretching the whole page and pushing the sidebar off screen. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
          <QstpMobileNav {...(cycleName ? { cycleName } : {})} />
          <CurrentSection />

          <div className="ml-auto flex items-center gap-2">
            <ActorSwitcher current={actor.role} />
            <UserMenu name={actor.fullName} role={actor.role.replace('_', ' ')} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
