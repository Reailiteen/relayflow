'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ChevronDown, LogIn } from 'lucide-react';
import { Button, TextField } from '@relayflow/ui-web';
import { signInAction } from '@/server/actions';

/**
 * The sign-in form.
 *
 * Against Supabase this is a real credential check: a wrong password is
 * refused. Without Supabase configured it falls back to matching the email to a
 * seeded persona, and the page says so — a demo that quietly implies
 * authentication is the thing that gets remembered as "the auth already works".
 *
 * The account picker fills the fields rather than submitting. One click still
 * gets you in, but you see which identity you are about to take, and the
 * password field is never a mystery.
 */

export interface DemoAccountView {
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly blurb: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
      <LogIn className="size-4" />
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function SignInForm({
  accounts,
  password,
  live,
}: {
  accounts: readonly DemoAccountView[];
  password: string;
  live: boolean;
}) {
  const [state, formAction] = useActionState(signInAction, { error: null });
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [open, setOpen] = useState(false);

  const pick = (account: DemoAccountView) => {
    setEmail(account.email);
    setSecret(password);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@qstp.org.qa"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(state.error ? { error: state.error } : {})}
        />

        <TextField
          label="Password"
          name="password"
          type="password"
          required={live}
          autoComplete="current-password"
          placeholder="••••••••"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          {...(live ? {} : { hint: 'Not checked while Supabase is unconfigured.' })}
        />

        <SubmitButton />
      </form>

      <div className="rounded-card border border-hairline">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-label text-ink-2 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span>
            Demo accounts
            <span className="ml-2 text-ink-3">
              password <code className="font-mono">{password}</code>
            </span>
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <ul className="border-t border-hairline">
            {accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => pick(account)}
                  className="w-full border-b border-hairline px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ink">{account.name}</span>
                    <span className="text-xs text-ink-3">{account.role}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-2">{account.blurb}</span>
                  <span className="mt-1 block font-mono text-2xs text-ink-3">
                    {account.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
