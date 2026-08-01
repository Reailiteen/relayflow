#!/usr/bin/env node
/**
 * Create the demo sign-in accounts in Supabase.
 *
 *   node --env-file=.env.local scripts/seed-auth-users.mjs
 *
 * Two routes, picked automatically:
 *
 *   SUPABASE_SERVICE_ROLE_KEY present — uses the admin API with
 *   `email_confirm: true`, so accounts are usable immediately and no mail is
 *   ever sent. This is the only route that can bypass confirmation.
 *
 *   Otherwise — falls back to ordinary sign-up with the publishable key. That
 *   works only if "Confirm email" is switched OFF in
 *   Authentication → Sign In / Providers → Email. If it is on, the accounts are
 *   created but cannot sign in until each inbox is opened, and this script says
 *   so rather than reporting success.
 *
 * Safe to re-run: an account that already exists is left alone.
 */

const PASSWORD = 'Pass123';

const ACCOUNTS = [
  { email: 'noor@qstp.org.qa', name: 'Noor Al-Kuwari', role: 'QSTP programme manager' },
  { email: 'faisal@qstp.org.qa', name: 'Faisal Al-Marri', role: 'QSTP operations' },
  { email: 'audit@qstp.org.qa', name: 'Programme Audit', role: 'QSTP read-only' },
  { email: 'dana@acmerobotics.qa', name: 'Dana Habib', role: 'Acme Robotics owner' },
  { email: 'reem@northwind.qa', name: 'Reem Al-Sulaiti', role: 'Northwind Analytics owner' },
  { email: 'karim@acmerobotics.qa', name: 'Karim Nasser', role: 'Acme Robotics supervisor' },
  { email: 'layla.ahmed@example.com', name: 'Layla Ahmed', role: 'Candidate' },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !(anon || service)) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and a key. Nothing to do.');
  process.exit(1);
}

const post = async (path, key, body) => {
  const res = await fetch(url + path, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, json };
};

const request = async (path, method, key, body) => {
  const res = await fetch(url + path, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body is fine */
  }
  return { status: res.status, json };
};

async function viaAdmin(account) {
  const { status, json } = await post('/auth/v1/admin/users', service, {
    email: account.email,
    password: PASSWORD,
    // The whole point: no mail, no click, usable now.
    email_confirm: true,
    user_metadata: { full_name: account.name, role: account.role },
  });
  if (status === 200 || status === 201) return { state: 'created' };

  const message = json?.msg ?? json?.message ?? json?.error_description ?? `HTTP ${status}`;
  if (!/already|exists|registered/i.test(String(message))) return { state: 'failed', message };

  // Already there — but possibly left unconfirmed by an earlier sign-up run,
  // which looks identical from outside and cannot sign in. Repair it rather
  // than reporting success on an account nobody can use.
  const found = await request(
    `/auth/v1/admin/users?filter=${encodeURIComponent(account.email)}`,
    'GET',
    service,
  );
  const user = found.json?.users?.find((row) => row.email === account.email);
  if (!user) return { state: 'exists' };
  if (user.email_confirmed_at) return { state: 'exists' };

  const fixed = await request(`/auth/v1/admin/users/${user.id}`, 'PUT', service, {
    email_confirm: true,
    password: PASSWORD,
  });
  if (fixed.status === 200) return { state: 'repaired' };
  return { state: 'failed', message: `could not confirm: HTTP ${fixed.status}` };
}

async function viaSignUp(account) {
  const { status, json } = await post('/auth/v1/signup', anon, {
    email: account.email,
    password: PASSWORD,
    data: { full_name: account.name, role: account.role },
  });
  if (status >= 400) {
    const message = json?.msg ?? json?.message ?? `HTTP ${status}`;
    if (/already|registered/i.test(String(message))) return { state: 'exists' };
    return { state: 'failed', message };
  }
  // A session means the project auto-confirms. No session means an email is
  // waiting in an inbox nobody owns, which is not a usable account.
  if (json?.access_token) return { state: 'created' };
  return { state: 'unconfirmed' };
}

async function main() {
  const mode = service ? 'admin (email_confirm)' : 'sign-up (needs confirm-email OFF)';
  console.log(`project : ${url}`);
  console.log(`mode    : ${mode}`);
  console.log(`password: ${PASSWORD}\n`);

  const counts = { created: 0, repaired: 0, exists: 0, unconfirmed: 0, failed: 0 };
  for (const account of ACCOUNTS) {
    const result = service ? await viaAdmin(account) : await viaSignUp(account);
    counts[result.state] += 1;
    const label = {
      created: 'created',
      repaired: 'confirmed an unusable account',
      exists: 'already there',
      unconfirmed: 'NEEDS CONFIRMATION',
      failed: `FAILED — ${result.message}`,
    }[result.state];
    console.log(`  ${account.email.padEnd(26)} ${label}`);
  }

  console.log(
    `\n${counts.created} created, ${counts.repaired} repaired, ` +
      `${counts.exists} already usable, ${counts.unconfirmed} unconfirmed, ${counts.failed} failed`,
  );

  if (counts.unconfirmed > 0) {
    console.log(
      '\nThese accounts cannot sign in yet. Either switch "Confirm email" OFF in\n' +
        'Authentication → Sign In / Providers → Email and re-run, or set\n' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local so the admin route can confirm them.',
    );
    process.exit(2);
  }
  if (counts.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
