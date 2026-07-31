import { redirect } from 'next/navigation';
import { isQstp } from '@relayflow/access';
import { getActor } from '@/server/context';
import { QstpNav } from './_components/nav';
import { ActorSwitcher } from './_components/actor-switcher';

/**
 * The QSTP shell.
 *
 * A route group per portal — (qstp), (startup), (candidate) — because the three
 * audiences need genuinely different chrome, but share one system underneath.
 *
 * The redirect here is convenience, not security: it puts people in the right
 * place rather than showing them an error. The actual protection is in the
 * use-cases, which authorize on every call regardless of the route taken.
 */
export default async function QstpLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isQstp(actor)) redirect('/signin');

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-md font-semibold tracking-tight">RelayFlow</span>
        </div>
        <QstpNav />
        <div className="ml-auto flex items-center gap-2">
          <ActorSwitcher current={actor.role} />
          <span className="hidden text-xs text-text-muted sm:inline">{actor.fullName}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
