import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isCandidate } from '@relayflow/access';
import { getActor, getContext } from '@/server/context';
import { AccountMenu } from '@/app/_components/account';
import { NotificationBell } from '@/app/_components/notifications';
import { TopBar, Workspace } from '@/app/_components/shell';
import { CandidateNav } from './_components/nav';

/**
 * The candidate shell.
 *
 * The same materials as the other two portals — the top bar, the brand lockup,
 * the account block, the canvas wash, the card system — in a different
 * arrangement. There is no rail, because a candidate is a student on a phone
 * who received one email: they are not navigating a workspace, they are
 * following a thread. Three sections do not earn 248px, so they sit inline and
 * the content gets a centred column instead.
 */
export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isCandidate(actor)) redirect('/signin');
  const candidate = await (await getContext()).repos.candidates.findById(actor.candidateId);
  const cycleId = candidate.ok && candidate.data ? candidate.data.cycleId : 'c1c1e000-0000-4000-8000-000000000001';

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <TopBar className="pl-5 sm:pl-[30px]">
        <Link
          href={`/candidate/cycles/${cycleId}/selection`}
          className="flex shrink-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand-tint"
            aria-hidden="true"
          >
            <span className="text-[15px] leading-none font-bold tracking-[-0.06em] text-brand">
              RF
            </span>
          </span>
          <span
            className="hidden text-[22px] leading-none font-bold tracking-[-0.01em] text-ink sm:block"
            style={{ fontFamily: 'var(--rf-font-wordmark)' }}
          >
            RelayFlow
          </span>
        </Link>

        <CandidateNav cycleId={cycleId} />

        {/* A candidate gets the same bell as everyone else. They are the party
            with the least context and the most at stake — a missed document
            deadline costs them the placement — so "we told them" has to be
            somewhere they can go back to, not only an email they may have
            filed. */}
        <div className="ml-auto flex items-center gap-3">
          <NotificationBell centerHref="/candidate/notifications" />
          <AccountMenu name={actor.fullName} detail={actor.email} />
        </div>
      </TopBar>

      <Workspace>
        <div className="mx-auto w-full max-w-3xl px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10">
          {children}
        </div>

        <footer className="px-[var(--rf-page-x)] pb-10 text-center text-label text-ink-3">
          Questions? Email{' '}
          <a
            href="mailto:internships@qstp.org.qa"
            className="font-medium text-brand hover:underline"
          >
            internships@qstp.org.qa
          </a>
        </footer>
      </Workspace>
    </div>
  );
}
