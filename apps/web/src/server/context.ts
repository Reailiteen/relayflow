import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { systemClock } from '@relayflow/core';
import { ANONYMOUS, type Actor, type MaybeActor } from '@relayflow/access';
import { createRepositories, type RlsClient } from '@relayflow/data';
import { createWebServerClient } from '@relayflow/data/web';
import { createLogger } from '@relayflow/logger';
import type { UseCaseContext } from '@relayflow/logic';
import type { OrganizationId, UserId } from '@relayflow/entities';
import { env } from '@/env';

/**
 * The data access layer.
 *
 * Next.js docs are explicit that Server Actions are reachable by direct POST,
 * so every one of them must verify the caller itself. This module is the only
 * place the app derives identity, and `getActor()` is memoized per request so
 * that doing it correctly costs one round trip rather than one per call site.
 *
 * Nothing here trusts a client-supplied user or organization id.
 */

export const getSupabase = cache(async (): Promise<RlsClient> => {
  const cookieStore = await cookies();
  return createWebServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookieStore,
  );
});

/**
 * Resolves the caller from the verified JWT, then loads their memberships.
 *
 * `getUser()` rather than `getSession()`: the former revalidates the token with
 * the auth server, the latter returns whatever is in the cookie. On the server
 * that difference is the whole security boundary.
 */
export const getActor = cache(async (): Promise<MaybeActor> => {
  const supabase = await getSupabase();
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
});

/** Assembles the context every use-case runs against. */
export const getContext = cache(async (): Promise<UseCaseContext> => {
  const client = await getSupabase();
  const actor = await getActor();

  return {
    actor,
    client,
    repos: createRepositories(client),
    clock: systemClock,
    logger: createLogger({
      minLevel: env.NODE_ENV === 'production' ? 'info' : 'debug',
      base: { app: 'web' },
    }),
  };
});
