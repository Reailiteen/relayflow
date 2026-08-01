'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  decideAllocation,
  decideException,
  reclaimHours,
  resolveConflict,
  selectCandidate,
} from '@relayflow/logic';
import { action, type ActionResult } from './action';
import { DEV_ACTOR_COOKIE } from './context';

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

export async function selectCandidateAction(input: unknown) {
  return revalidate(await action(selectCandidate)(input));
}

/**
 * Fake sign-in.
 *
 * There is no authentication yet — this only records which seeded persona the
 * session is acting as, then sends them to their portal. It is a demo
 * affordance, and it is deliberately the only thing standing in for auth so
 * that replacing it later is a single, obvious change.
 */
export async function signInAsAction(formData: FormData) {
  // FormData entries can be Files, which stringify to "[object Object]".
  const raw = formData.get('persona');
  const persona = typeof raw === 'string' && raw.length > 0 ? raw : 'manager';
  const store = await cookies();
  store.set(DEV_ACTOR_COOKIE, persona, { path: '/', maxAge: 60 * 60 * 24 });

  const destination =
    persona === 'startupOwner' || persona === 'supervisor' || persona === 'lateStartup'
      ? '/startup'
      : persona === 'candidate'
        ? '/candidate'
        : '/';

  revalidatePath('/', 'layout');
  redirect(destination);
}

export async function signOutAction() {
  const store = await cookies();
  store.set(DEV_ACTOR_COOKIE, 'anonymous', { path: '/', maxAge: 60 * 60 * 24 });
  revalidatePath('/', 'layout');
  redirect('/signin');
}
