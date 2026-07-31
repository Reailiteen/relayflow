import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { Database } from '../generated/database.types';
import type { RlsClient } from '../client';

/**
 * Next.js client construction lives here rather than in the app, so that
 * "@relayflow/data is the only package that imports a Supabase SDK" stays a
 * rule a linter can check, not a habit.
 *
 * Both factories produce RLS-bound clients carrying the end user's JWT. There
 * is no path from here to the service role — that is `@relayflow/data/admin`,
 * which apps cannot import.
 */

export interface CookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options: Record<string, unknown>): void;
}

/** Browser/client-component client. Reads only public env. */
export function createWebBrowserClient(url: string, anonKey: string): RlsClient {
  return createBrowserClient<Database>(url, anonKey);
}

/**
 * Server-component / route-handler client, bound to the request's cookies.
 *
 * Server Components cannot set cookies, so writes there are swallowed — that is
 * expected, and middleware refreshes the session instead.
 */
export function createWebServerClient(
  url: string,
  anonKey: string,
  cookies: CookieStore,
): RlsClient {
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            cookies.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: middleware owns the refresh.
        }
      },
    },
  });
}
