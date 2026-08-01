import { NextResponse, type NextRequest } from 'next/server';
import { createWebServerClient } from '@relayflow/data/web';

/**
 * Session refresh, on every request.
 *
 * Supabase access tokens are short-lived. Server Components cannot write
 * cookies, so without this the token would expire mid-session and the user
 * would be signed out with no way to notice. This is the one place allowed to
 * write refreshed cookies back onto the response.
 *
 * Named `proxy`, not `middleware`: Next 16 renamed both the file and the export
 * and deprecated the old names. See
 * node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
 *
 * It goes through `@relayflow/data/web` rather than importing the Supabase SDK,
 * so the rule that only that package constructs a client still holds.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured: the app is on fixtures and there is no session to refresh.
  if (!url || !key) return NextResponse.next({ request });

  const response = NextResponse.next({ request });

  const supabase = createWebServerClient(url, key, {
    getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    // Written to both: the request copy so anything later in this same pass
    // sees the fresh token, the response so the browser keeps it.
    set: (name, value, options) => {
      request.cookies.set(name, value);
      response.cookies.set(name, value, options);
    },
  });

  // Do not remove. Calling this performs the refresh — the returned user is
  // discarded, the cookie write is the point.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets. Those carry no session, and refreshing
     * on each one would multiply the auth traffic for no benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
