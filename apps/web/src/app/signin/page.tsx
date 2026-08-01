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
    <div
      className="min-h-dvh bg-canvas"
      style={{
        backgroundImage:
          'radial-gradient(70% 45% at 50% -8%, var(--rf-canvas-wash) 0%, transparent 65%)',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-12">
        <header>
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand-tint"
              aria-hidden="true"
            >
              <span className="text-[15px] leading-none font-bold tracking-[-0.06em] text-brand">
                RF
              </span>
            </span>
            <span
              className="text-[24px] leading-none font-bold tracking-[-0.01em] text-ink"
              style={{ fontFamily: 'var(--rf-font-wordmark)' }}
            >
              RelayFlow
            </span>
          </div>

          <h1 className="mt-6 text-display leading-tight font-bold tracking-[-0.02em] text-ink">
            Sign in
          </h1>
          <p className="mt-2 text-label text-ink-3">
            Internship operations for QSTP — allocation through onboarding.
          </p>
        </header>

        <Panel>
          <div className="p-5">
            <SignInForm />
          </div>
        </Panel>

        <div className="flex items-start gap-2.5 rounded-card bg-warning-subtle px-4 py-3 text-label text-warning-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Demo build. </strong>
            No password is checked and no session is created — signing in records which seeded
            person you are looking as.
          </span>
        </div>

        <Panel>
          <PanelHeader
            title="Demo accounts"
            aside={<span className="text-xs text-ink-3">one click</span>}
          />
          {DEMO_ACCOUNTS.map((account) => (
            <form key={account.persona} action={signInAsAction}>
              <input type="hidden" name="persona" value={account.persona} />
              <button
                type="submit"
                className="group flex w-full items-center gap-3 border-b border-hairline px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ink">{account.name}</span>
                    <span className="text-xs text-ink-3">{account.role}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-2">{account.blurb}</p>
                  <p className="mt-1 font-mono text-2xs text-ink-3">{account.email}</p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </form>
          ))}
        </Panel>
      </main>
    </div>
  );
}
