import { homePortal } from '@relayflow/access';
import { getActor } from '@/server/context';

/**
 * Placeholder. Real authentication arrives with the backend; for now this
 * exists so the portal redirects have somewhere to land.
 */
export default async function SignInPage() {
  const actor = await getActor();
  const portal = homePortal(actor);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-sm flex-col gap-2 text-center">
        <h1 className="text-lg font-semibold">RelayFlow</h1>
        <p className="text-sm text-text-muted">
          {portal === 'signin'
            ? 'Signed out. Authentication is not wired up yet.'
            : `You are acting as a ${portal} user, which has no portal built yet. Switch to a QSTP role to see the dashboard.`}
        </p>
      </div>
    </main>
  );
}
