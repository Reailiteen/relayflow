import 'server-only';
import { getSupabaseServerClient, supabaseEnv } from './supabase';

/**
 * Authentication.
 *
 * Two paths, and the sign-in page says which one is live:
 *
 *   Supabase configured — a real credential check. A wrong password is refused,
 *   the session is a signed JWT in an httpOnly cookie, and `proxy.ts` refreshes
 *   it before it expires.
 *
 *   Not configured — the email is matched to a seeded persona and recorded in a
 *   cookie. No password is checked, and the page says so plainly.
 *
 * Identity resolves through `DEMO_ACCOUNTS` in both cases, because the
 * repositories are still fixtures and a Supabase user id has no fixture startup
 * behind it. When the data cutover lands this mapping becomes a read of
 * `qstp_staff` / `startup_members` / `candidates`, and nothing else moves.
 */

/**
 * One password for every seeded account.
 *
 * Only defensible because these are fictional people in a demo project holding
 * no real data. It must not survive contact with a real cohort.
 */
export const DEMO_PASSWORD = 'Pass123';

export const DEMO_ACCOUNTS = [
  {
    email: 'noor@qstp.org.qa',
    persona: 'manager',
    name: 'Noor Al-Kuwari',
    role: 'QSTP · Programme manager',
    blurb: 'Full control. Allocations, exception decisions, redistribution.',
    destination: '/',
  },
  {
    email: 'faisal@qstp.org.qa',
    persona: 'operations',
    name: 'Faisal Al-Marri',
    role: 'QSTP · Operations',
    blurb: 'Day-to-day work, but cannot reshape the budget or override tiers.',
    destination: '/',
  },
  {
    email: 'audit@qstp.org.qa',
    persona: 'auditor',
    name: 'Programme Audit',
    role: 'QSTP · Read-only',
    blurb: 'Sees everything, changes nothing. Useful for checking the gating.',
    destination: '/',
  },
  {
    email: 'dana@acmerobotics.qa',
    persona: 'startupOwner',
    name: 'Dana Habib',
    role: 'Acme Robotics · Owner',
    blurb: '60 hours allocated, positions submitted, one intern already placed.',
    destination: '/startup',
  },
  {
    email: 'reem@northwind.qa',
    persona: 'lateStartup',
    name: 'Reem Al-Sulaiti',
    role: 'Northwind Analytics · Owner',
    blurb: 'Missed the selection deadline. Has an exception request pending.',
    destination: '/startup',
  },
  {
    email: 'karim@acmerobotics.qa',
    persona: 'supervisor',
    name: 'Karim Nasser',
    role: 'Acme Robotics · Supervisor',
    blurb: 'Runs interviews, but cannot select candidates or request extensions.',
    destination: '/startup',
  },
  {
    email: 'layla.ahmed@example.com',
    persona: 'candidate',
    name: 'Layla Ahmed',
    role: 'Candidate',
    blurb: 'Placed at Acme. Working through onboarding documents.',
    destination: '/candidate',
  },
] as const;

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export function isSupabaseAuthConfigured(): boolean {
  return supabaseEnv() !== null;
}

/** Matches an email to a seeded persona. Case- and whitespace-insensitive. */
export function accountForEmail(email: string): DemoAccount | null {
  const normalised = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email === normalised) ?? null;
}

export function accountForPersona(persona: string): DemoAccount | null {
  return DEMO_ACCOUNTS.find((account) => account.persona === persona) ?? null;
}

export interface SignInOutcome {
  readonly ok: boolean;
  readonly error: string | null;
  readonly account: DemoAccount | null;
}

/**
 * Check credentials.
 *
 * The failure message is the same whether the email is unknown or the password
 * is wrong. Distinguishing them turns the form into a way to enumerate who has
 * an account.
 */
export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  const account = accountForEmail(email);

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    // Fixtures: there is no credential to check, so identity is all there is.
    return account
      ? { ok: true, error: null, account }
      : { ok: false, error: 'No seeded account uses that email.', account: null };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    return { ok: false, error: 'That email and password do not match an account.', account: null };
  }
  if (!account) {
    // Authenticated, but nothing in the fixtures answers to this person. Saying
    // so beats dropping them on an empty dashboard.
    return {
      ok: false,
      error: 'Signed in, but this account has no seeded profile yet.',
      account: null,
    };
  }
  return { ok: true, error: null, account };
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
}

/** The signed-in user's email, or null when there is no Supabase session. */
export async function currentEmail(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
