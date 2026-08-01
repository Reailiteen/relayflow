'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  confirmAvailability,
  confirmDocumentFields,
  decideAllocation,
  decideException,
  grantHours,
  importCandidates,
  moveCandidateCard,
  moveStartupCard,
  reclaimHours,
  requestException,
  resolveConflict,
  reviewPosition,
  sharePool,
  selectCandidate,
  submitPosition,
  uploadDocument,
  verifyDocument,
} from '@relayflow/logic';
import { action, type ActionResult } from './action';
import { DEV_ACTOR_COOKIE } from './context';
import { accountForEmail, accountForPersona } from './auth';

/**
 * Every mutation the demo can perform.
 *
 * Each is one line, because validation, authorization and the business rules
 * are already decided in the use-case. There is nowhere here to forget a check.
 *
 * They mutate the in-memory fixture store, so changes persist until the dev
 * server restarts — enough for a demo to feel real, and honest about being
 * temporary.
 */

const revalidate = <T>(result: ActionResult<T>): ActionResult<T> => {
  // Coarse on purpose: the fixture store is shared, so a decision on one screen
  // changes the numbers on several others.
  revalidatePath('/', 'layout');
  return result;
};

export async function decideAllocationAction(input: unknown) {
  return revalidate(await action(decideAllocation)(input));
}

export async function decideExceptionAction(input: unknown) {
  return revalidate(await action(decideException)(input));
}

export async function resolveConflictAction(input: unknown) {
  return revalidate(await action(resolveConflict)(input));
}

export async function reclaimHoursAction(input: unknown) {
  return revalidate(await action(reclaimHours)(input));
}

export async function grantHoursAction(input: unknown) {
  return revalidate(await action(grantHours)(input));
}

export async function selectCandidateAction(input: unknown) {
  return revalidate(await action(selectCandidate)(input));
}

export async function submitPositionAction(input: unknown) {
  return revalidate(await action(submitPosition)(input));
}

export async function requestExceptionAction(input: unknown) {
  return revalidate(await action(requestException)(input));
}

export async function reviewPositionAction(input: unknown) {
  return revalidate(await action(reviewPosition)(input));
}

export async function importCandidatesAction(input: unknown) {
  return revalidate(await action(importCandidates)(input));
}

export async function sharePoolAction(input: unknown) {
  return revalidate(await action(sharePool)(input));
}

export async function moveStartupCardAction(input: unknown) {
  return revalidate(await action(moveStartupCard)(input));
}

export async function moveCandidateCardAction(input: unknown) {
  return revalidate(await action(moveCandidateCard)(input));
}

export async function confirmAvailabilityAction(input: unknown) {
  return revalidate(await action(confirmAvailability)(input));
}

export async function uploadDocumentAction(input: unknown) {
  return revalidate(await action(uploadDocument)(input));
}

export async function confirmDocumentFieldsAction(input: unknown) {
  return revalidate(await action(confirmDocumentFields)(input));
}

export async function verifyDocumentAction(input: unknown) {
  return revalidate(await action(verifyDocument)(input));
}

/**
 * Sign in — without authenticating anything.
 *
 * The password is accepted and discarded. What actually happens is that the
 * email is matched to a seeded persona and recorded in a cookie. The form is
 * real, the credential check is not, and the UI says so rather than implying a
 * security boundary that does not exist.
 *
 * Returns an error instead of redirecting when the email is unknown, so the
 * form can say which addresses work.
 */
export async function signInAction(
  _previous: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw : '';

  if (!email.trim()) return { error: 'Enter your email address.' };

  const account = accountForEmail(email);
  if (!account) {
    return {
      error: 'No account with that email. Use one of the demo accounts listed below.',
    };
  }

  const store = await cookies();
  store.set(DEV_ACTOR_COOKIE, account.persona, { path: '/', maxAge: 60 * 60 * 24 });

  revalidatePath('/', 'layout');
  redirect(account.destination);
}

/** One-click sign-in from the demo account list. */
export async function signInAsAction(formData: FormData) {
  const raw = formData.get('persona');
  const persona = typeof raw === 'string' && raw.length > 0 ? raw : 'manager';
  const account = accountForPersona(persona);

  const store = await cookies();
  store.set(DEV_ACTOR_COOKIE, persona, { path: '/', maxAge: 60 * 60 * 24 });

  revalidatePath('/', 'layout');
  redirect(account?.destination ?? '/');
}

/**
 * Sign out.
 *
 * Clears the cookie and returns to the sign-in screen. With a real session this
 * would also revoke it server-side — the point of routing it through an action
 * now is that the call site never changes when that happens.
 */
export async function signOutAction() {
  const store = await cookies();
  store.delete(DEV_ACTOR_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/signin');
}
