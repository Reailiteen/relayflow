import 'server-only';

/**
 * Stand-in authentication.
 *
 * There is no password check, no session token and no user table lookup. Signing
 * in maps an email to one of the seeded personas and records it in a cookie.
 *
 * It is deliberately concentrated here so that replacing it is a single file:
 * `personaForEmail` becomes a credential check, and the cookie becomes a real
 * session. Everything downstream already reads identity from `getActor()`, so
 * nothing else has to change.
 */

/** Seeded accounts, keyed by the email each persona actually has. */
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

/** Matches an email to a seeded persona. Case- and whitespace-insensitive. */
export function accountForEmail(email: string): DemoAccount | null {
  const normalised = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.email === normalised) ?? null;
}

export function accountForPersona(persona: string): DemoAccount | null {
  return DEMO_ACCOUNTS.find((account) => account.persona === persona) ?? null;
}
