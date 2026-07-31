import { isAuthenticated } from '@relayflow/access';
import { getActor } from '@/server/context';

/**
 * Placeholder shell. It exists to prove the wiring end to end: this Server
 * Component resolves the caller through the same data access layer every
 * use-case uses, rather than reading a cookie itself.
 */
export default async function HomePage() {
  const actor = await getActor();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Relayflow</h1>
      <p className="text-[var(--color-text-muted)]">
        {isAuthenticated(actor)
          ? `Signed in as ${actor.email} · ${actor.memberships.length} workspace(s)`
          : 'Not signed in.'}
      </p>
    </main>
  );
}
