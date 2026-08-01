import { ArrowRight, TriangleAlert } from 'lucide-react';
import { Panel, PanelHeader } from '@relayflow/ui-web';
import { DEMO_ACCOUNTS } from '@/server/auth';
import { signInAsAction } from '@/server/actions';
import { SignInForm } from './_form';

export const metadata = { title: 'Sign in' };

/**
 * Sign in.
 *
 * The form is the primary path because that is the shape the real thing will
 * take, and building the layout now means wiring authentication later changes
 * behaviour rather than design. The account list beneath is a demo affordance
 * and is labelled as one — it exists so the system can be walked through from
 * any vantage point without remembering seven email addresses.
 */
export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-md font-semibold tracking-tight">RelayFlow</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-text-muted">
          Internship operations for QSTP — allocation through onboarding.
        </p>
      </header>

      <Panel>
        <div className="p-3">
          <SignInForm />
        </div>
      </Panel>

      <div className="flex items-start gap-2 rounded-md bg-warning-subtle px-2.5 py-2 text-sm text-warning-text">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Demo build. </strong>
          No password is checked and no session is created — signing in records which seeded person
          you are looking as.
        </span>
      </div>

      <Panel>
        <PanelHeader
          title="Demo accounts"
          aside={<span className="text-xs text-text-muted">one click</span>}
        />
        {DEMO_ACCOUNTS.map((account) => (
          <form key={account.persona} action={signInAsAction}>
            <input type="hidden" name="persona" value={account.persona} />
            <button
              type="submit"
              className="group flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{account.name}</span>
                  <span className="text-xs text-text-muted">{account.role}</span>
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">{account.blurb}</p>
                <p className="mt-0.5 font-mono text-xs text-text-muted">{account.email}</p>
              </div>
              <ArrowRight
                className="size-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          </form>
        ))}
      </Panel>
    </main>
  );
}
