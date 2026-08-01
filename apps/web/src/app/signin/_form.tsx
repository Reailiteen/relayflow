'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { LogIn } from 'lucide-react';
import { Button, TextField } from '@relayflow/ui-web';
import { signInAction } from '@/server/actions';

/**
 * The sign-in form.
 *
 * A real form — labelled fields, a password input, keyboard submit, an error
 * region — over a credential check that does not exist. The password is
 * accepted and thrown away, and the note beneath says so, because a demo that
 * quietly implies authentication is the kind of thing that gets remembered as
 * "the auth already works".
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
      <LogIn className="size-4" />
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="username"
        autoFocus
        placeholder="you@qstp.org.qa"
        {...(state.error ? { error: state.error } : {})}
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Anything at all"
        hint="Not checked. There is no authentication behind this form yet."
      />

      <SubmitButton />
    </form>
  );
}
