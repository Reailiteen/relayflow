import { can, isAuthenticated } from '@relayflow/access';
import { listOrganizations } from '@relayflow/logic';
import { getActor, getContext } from '@/server/context';

/**
 * Placeholder shell — it exists to prove the wiring end to end, not to be the
 * product. Real screens land once we've agreed the UI direction.
 *
 * What it demonstrates: a Server Component resolving the caller through the
 * data access layer, calling a genuine use-case (which authorizes itself), and
 * gating an affordance on a capability rather than on a role string.
 */
export default async function HomePage() {
  const actor = await getActor();
  const ctx = await getContext();
  const result = await listOrganizations(ctx, {});

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Relayflow</h1>
        <p className="text-[var(--color-text-muted)]">
          {isAuthenticated(actor)
            ? `Acting as ${actor.email}`
            : 'Signed out — no workspaces visible.'}
        </p>
      </header>

      {result.ok ? (
        <ul className="flex flex-col gap-2">
          {result.data.map((organization) => (
            <li
              key={organization.id}
              className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            >
              <span className="min-w-0 truncate font-medium">{organization.name}</span>
              {/* The button is capability-gated, not role-gated. Switch the dev
                  actor and this appears or disappears accordingly. */}
              {can(actor, { capability: 'member:invite', organizationId: organization.id }) && (
                <span className="shrink-0 text-sm text-[var(--color-text-muted)]">
                  can invite members
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--color-critical)]">{result.error.message}</p>
      )}

      <p className="text-sm text-[var(--color-text-muted)]">
        Running on in-memory fixtures. Set the{' '}
        <code className="rounded bg-[var(--color-surface)] px-1">relayflow_dev_actor</code> cookie
        to <code>owner</code>, <code>admin</code>, <code>member</code>, <code>suspended</code> or{' '}
        <code>anonymous</code> to see how the interface changes.
      </p>
    </main>
  );
}
