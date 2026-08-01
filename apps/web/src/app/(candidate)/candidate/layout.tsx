import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isCandidate } from '@relayflow/access';
import { getActor } from '@/server/context';
import { CandidateNav } from './_components/nav';

/**
 * The candidate shell.
 *
 * Deliberately unlike the other two portals: no sidebar, a centred column, and
 * larger type. A candidate is a student on a phone who received one email —
 * they are not navigating a workspace, they are following a thread. The whole
 * portal is four screens and should feel like it.
 */
export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!isCandidate(actor)) redirect('/signin');

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link href="/candidate" className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-md font-semibold tracking-tight">RelayFlow</span>
        </Link>
        <CandidateNav />
        <span className="ml-auto truncate text-sm text-text-muted">{actor.fullName}</span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">{children}</main>

      <footer className="border-t border-border px-4 py-3 text-center text-sm text-text-muted">
        Questions? Email{' '}
        <a href="mailto:internships@qstp.org.qa" className="text-accent hover:underline">
          internships@qstp.org.qa
        </a>
      </footer>
    </div>
  );
}
