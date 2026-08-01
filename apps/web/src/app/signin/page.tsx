import Image from 'next/image';
import { TriangleAlert } from 'lucide-react';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, isSupabaseAuthConfigured } from '@/server/auth';
import { SignInForm } from './_form';

export const metadata = { title: 'Sign in' };

/**
 * Sign in.
 *
 * Two panels: the form on the left, a photograph on the right. The photograph
 * is not decoration for its own sake — this product exists to place people, and
 * a page of nothing but fields makes it feel like a spreadsheet.
 *
 * The right panel is `hidden lg:block`, so on a phone the form gets the whole
 * screen instead of sitting below a large image nobody scrolled for.
 */
export default function SignInPage() {
  const live = isSupabaseAuthConfigured();

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Left: the form ──────────────────────────────────────────────── */}
      <main className="flex min-h-dvh flex-col justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-sm">
          <header>
            <div className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand-tint"
                aria-hidden="true"
              >
                <span className="text-[15px] leading-none font-bold tracking-[-0.06em] text-brand">
                  RF
                </span>
              </span>
              <span
                className="text-[24px] leading-none font-bold tracking-[-0.01em] text-ink"
                style={{ fontFamily: 'var(--rf-font-wordmark)' }}
              >
                RelayFlow
              </span>
            </div>

            <h1 className="mt-8 text-display leading-tight font-bold tracking-[-0.02em] text-ink">
              Sign in
            </h1>
            <p className="mt-2 text-label text-ink-3">
              Internship operations for QSTP — allocation through onboarding.
            </p>
          </header>

          <div className="mt-7">
            <SignInForm accounts={DEMO_ACCOUNTS} password={DEMO_PASSWORD} live={live} />
          </div>

          {!live ? (
            <div className="mt-6 flex items-start gap-2.5 rounded-card bg-warning-subtle px-4 py-3 text-label text-warning-text">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Demo mode. </strong>
                Supabase is not configured, so no password is checked — signing in only
                records which seeded person you are looking as.
              </span>
            </div>
          ) : null}
        </div>
      </main>

      {/* ── Right: the photograph ───────────────────────────────────────── */}
      <aside className="relative hidden lg:block">
        <Image
          src="/signin-cover.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 52vw, 0px"
          className="object-cover"
        />
        {/* A scrim, so the caption stays legible whatever the photograph does. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(200deg, rgba(9,12,20,0.10) 0%, rgba(9,12,20,0.52) 55%, rgba(9,12,20,0.86) 100%)',
          }}
          aria-hidden="true"
        />
        <figure className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
          <blockquote className="max-w-md text-[22px] leading-snug font-semibold tracking-[-0.01em] text-white xl:text-[26px]">
            Between a nomination and a first day, work happens that nobody can see.
          </blockquote>
          <figcaption className="mt-3 max-w-md text-label text-white/70">
            RelayFlow is where it becomes visible — evaluation, allocation, roles,
            shortlists, interviews and onboarding, in one place.
          </figcaption>
        </figure>
      </aside>
    </div>
  );
}
