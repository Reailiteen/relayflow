import 'server-only';
import { cookies } from 'next/headers';
import { createWebServerClient } from '@relayflow/data/web';
import type { RlsClient } from '@relayflow/data';

/**
 * Reading the project's public credentials.
 *
 * Two names are accepted for the key because Supabase changed formats: older
 * projects issue a `NEXT_PUBLIC_SUPABASE_ANON_KEY` JWT, newer ones a
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). Both are the
 * same thing — a key designed to be public, with row-level security doing the
 * actual protecting.
 *
 * Absence is a supported state, not an error. Without these the app falls back
 * to fixtures and says so on the sign-in page, so a fresh clone still runs.
 */
export interface SupabaseEnv {
  readonly url: string;
  readonly key: string;
}

export function supabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * A request-scoped client carrying the caller's JWT, so every statement it
 * makes runs under row-level security as that user.
 *
 * Returns null when the project is not configured — callers treat that as
 * "we are on fixtures" rather than throwing, which is what keeps the demo path
 * working on a machine with no `.env.local`.
 */
export async function getSupabaseServerClient(): Promise<RlsClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createWebServerClient(env.url, env.key, {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    set: (name, value, options) => {
      store.set(name, value, options);
    },
  });
}
