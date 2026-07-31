import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Session refresh at the network edge of the app.
 *
 * Renamed from middleware.ts in Next.js 16; the runtime is Node.js and is not
 * configurable. Its only job is to keep the auth cookie fresh so Server
 * Components see a valid session.
 *
 * This is deliberately NOT where authorization happens. Next's own guidance
 * calls proxy checks "optimistic" — the real gate is in the use-case layer,
 * which runs on every call regardless of how the request arrived. Redirecting
 * here is a UX nicety, not a security control.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touching getUser() is what triggers the refresh; the result is intentionally
  // unused here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets — refreshing a session to serve a favicon is waste.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
