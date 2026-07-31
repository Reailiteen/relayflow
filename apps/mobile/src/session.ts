import AsyncStorage from '@react-native-async-storage/async-storage';
import { systemClock } from '@relayflow/core';
import { ANONYMOUS, type Actor, type MaybeActor } from '@relayflow/access';
import { createRepositories, type RlsClient } from '@relayflow/data';
import { createNativeClient } from '@relayflow/data/native';
import { createLogger } from '@relayflow/logger';
import type { UseCaseContext } from '@relayflow/logic';
import type { OrganizationId, UserId } from '@relayflow/entities';

/**
 * The mobile counterpart to apps/web/src/server/context.ts.
 *
 * Deliberately the same shape: resolve the actor from a verified token, build
 * repositories over an RLS-bound client, hand both to the same use-cases. Web
 * and mobile share every authorization decision because they share the code
 * that makes it — that is the whole reason `logic` is a package rather than a
 * folder in each app.
 */

// Expo inlines EXPO_PUBLIC_* at build time. There are no Node types here, so
// process.env is untyped — narrowed once, rather than letting `any` spread.
const publicEnv = process.env as Record<string, string | undefined>;

const url = publicEnv.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = publicEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. See .env.example.',
  );
}

export const supabase: RlsClient = createNativeClient(url, anonKey, AsyncStorage);

const logger = createLogger({
  minLevel: __DEV__ ? 'debug' : 'info',
  base: { app: 'mobile' },
});

/**
 * `getUser()` rather than reading the cached session: it revalidates the token
 * against the auth server. A device holding a revoked token must not be able to
 * act on it.
 */
export async function resolveActor(): Promise<MaybeActor> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return ANONYMOUS;

  const { data: rows } = await supabase
    .from('memberships')
    .select('organization_id, role, status')
    .eq('user_id', data.user.id);

  const actor: Actor = {
    userId: data.user.id as UserId,
    email: data.user.email ?? '',
    memberships: (rows ?? []).map((row) => ({
      organizationId: row.organization_id as OrganizationId,
      role: row.role,
      status: row.status,
    })),
  };

  return actor;
}

export async function createContext(): Promise<UseCaseContext> {
  return {
    actor: await resolveActor(),
    client: supabase,
    repos: createRepositories(supabase),
    clock: systemClock,
    logger,
  };
}
