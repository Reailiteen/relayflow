import { ArrowRight } from 'lucide-react';
import { Panel } from '@relayflow/ui-web';
import { signInAsAction } from '@/server/actions';

export const metadata = { title: 'Sign in' };

/**
 * Fake sign-in.
 *
 * There is no authentication and no password — picking a persona sets a cookie
 * and drops you into that portal. This exists so the demo can be walked through
 * from any vantage point, and so the seam where real auth will go is a single
 * obvious file rather than something threaded through the app.
 */

const PERSONAS = [
  {
    key: 'manager',
    name: 'Noor Al-Kuwari',
    role: 'QSTP · Programme manager',
    blurb: 'Full control. Allocations, exception decisions, redistribution.',
  },
  {
    key: 'operations',
    name: 'Faisal Al-Marri',
    role: 'QSTP · Operations',
    blurb: 'Day-to-day work, but cannot reshape the budget or override tiers.',
  },
  {
    key: 'auditor',
    name: 'Programme Audit',
    role: 'QSTP · Read-only',
    blurb: 'Sees everything, can change nothing. Useful for checking the gating.',
  },
  {
    key: 'startupOwner',
    name: 'Dana Habib',
    role: 'Acme Robotics · Owner',
    blurb: '60 hours allocated, positions submitted, one intern already placed.',
  },
  {
    key: 'lateStartup',
    name: 'Reem Al-Sulaiti',
    role: 'Northwind Analytics · Owner',
    blurb: 'Missed the selection deadline. Has an exception request pending.',
  },
  {
    key: 'candidate',
    name: 'Layla Ahmed',
    role: 'Candidate',
    blurb: 'Placed at Acme. Working through onboarding documents.',
  },
] as const;

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-md font-semibold tracking-tight">RelayFlow</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Continue as…</h1>
        <p className="text-sm text-text-muted">
          A demo with no authentication. Pick a person to see the system from their side — the
          permissions are real even though the sign-in is not.
        </p>
      </header>

      <Panel>
        {PERSONAS.map((persona) => (
          <form key={persona.key} action={signInAsAction}>
            <input type="hidden" name="persona" value={persona.key} />
            <button
              type="submit"
              className="group flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{persona.name}</span>
                  <span className="text-xs text-text-muted">{persona.role}</span>
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">{persona.blurb}</p>
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
