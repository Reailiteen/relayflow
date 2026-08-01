'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  acceptOffer,
  assignTask,
  respondToSelection,
  confirmAvailability,
  confirmDocumentFields,
  decideAllocation,
  decideException,
  grantHours,
  importCandidates,
  moveCandidateCard,
  movePositionCard,
  moveStartupCard,
  reclaimHours,
  attachRecording,
  requestException,
  saveInterviewFeedback,
  scheduleInterview,
  resolveConflict,
  reviewPosition,
  sharePool,
  selectCandidate,
  submitPosition,
  uploadDocument,
  verifyDocument,
  acknowledgeAllocation,
  archiveCycle,
  advanceCycleStage,
  cancelPlacement,
  closeRedistributionRound,
  confirmPlacement,
  createCycle,
  confirmRecovery,
  createRedistributionRound,
  decideRequirement,
  finalizePlacement,
  inviteRedistribution,
  openCandidateChoiceFallback,
  overrideCandidateChoice,
  protectRecovery,
  publishAllocations,
  runPrioritization,
  setPlacementReadiness,
  saveParticipation,
  saveRequirementTemplate,
  saveTaskTemplate,
  signPlacementAgreement,
  submitRequirement,
  submitTask,
  reviewTask,
  resolveSelectionConflict,
  respondCandidateChoiceFallback,
  respondRedistributionInvitation,
  transitionPosition,
  updateCycle,
} from '@relayflow/logic';
import { action, type ActionResult } from './action';
import {
  DEV_ACTOR_COOKIE,
  FIXTURE_SCENARIO_NAMES,
  resetDevelopmentFixtures,
} from './context';
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

/**
 * The candidate choosing where they work. Declining the other offers happens
 * inside the same write, so there is no second action to forget to call.
 */
export async function acceptOfferAction(input: unknown) {
  return revalidate(await action(acceptOffer)(input));
}

export async function respondToSelectionAction(input: unknown) {
  return revalidate(await action(respondToSelection)(input));
}

export async function submitPositionAction(input: unknown) {
  return revalidate(await action(submitPosition)(input));
}

export async function scheduleInterviewAction(input: unknown) {
  return revalidate(await action(scheduleInterview)(input));
}

export async function attachRecordingAction(input: unknown) {
  return revalidate(await action(attachRecording)(input));
}

export async function saveInterviewFeedbackAction(input: unknown) {
  return revalidate(await action(saveInterviewFeedback)(input));
}

export async function requestExceptionAction(input: unknown) {
  return revalidate(await action(requestException)(input));
}

export async function movePositionCardAction(input: unknown) {
  return revalidate(await action(movePositionCard)(input));
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

export async function acknowledgeAllocationAction(input: unknown) {
  return revalidate(await action(acknowledgeAllocation)(input));
}

export async function saveParticipationAction(input: unknown) {
  return revalidate(await action(saveParticipation)(input));
}

export async function createCycleAction(input: unknown) {
  return revalidate(await action(createCycle)(input));
}

export async function updateCycleAction(input: unknown) {
  return revalidate(await action(updateCycle)(input));
}

export async function archiveCycleAction(input: unknown) {
  return revalidate(await action(archiveCycle)(input));
}

export async function runPrioritizationAction(input: unknown) {
  return revalidate(await action(runPrioritization)(input));
}

export async function publishAllocationsAction(input: unknown) {
  return revalidate(await action(publishAllocations)(input));
}

export async function advanceCycleStageAction(input: unknown) {
  return revalidate(await action(advanceCycleStage)(input));
}

export async function transitionPositionAction(input: unknown) {
  return revalidate(await action(transitionPosition)(input));
}

export async function setPlacementReadinessAction(input: unknown) {
  return revalidate(await action(setPlacementReadiness)(input));
}

export async function finalizePlacementAction(input: unknown) {
  return revalidate(await action(finalizePlacement)(input));
}

export async function confirmPlacementAction(input: unknown) {
  return revalidate(await action(confirmPlacement)(input));
}

export async function cancelPlacementAction(input: unknown) {
  return revalidate(await action(cancelPlacement)(input));
}

export async function confirmRecoveryAction(input: unknown) {
  return revalidate(await action(confirmRecovery)(input));
}

export async function createRedistributionRoundAction(input: unknown) {
  return revalidate(await action(createRedistributionRound)(input));
}

export async function inviteRedistributionAction(input: unknown) {
  return revalidate(await action(inviteRedistribution)(input));
}

export async function openCandidateChoiceFallbackAction(input: unknown) {
  return revalidate(await action(openCandidateChoiceFallback)(input));
}

export async function respondCandidateChoiceFallbackAction(input: unknown) {
  return revalidate(await action(respondCandidateChoiceFallback)(input));
}

export async function overrideCandidateChoiceAction(input: unknown) {
  return revalidate(await action(overrideCandidateChoice)(input));
}

export async function saveTaskTemplateAction(input: unknown) {
  return revalidate(await action(saveTaskTemplate)(input));
}

export async function assignTaskAction(input: unknown) {
  return revalidate(await action(assignTask)(input));
}

export async function submitTaskAction(input: unknown) {
  return revalidate(await action(submitTask)(input));
}

export async function reviewTaskAction(input: unknown) {
  return revalidate(await action(reviewTask)(input));
}

export async function saveRequirementTemplateAction(input: unknown) {
  return revalidate(await action(saveRequirementTemplate)(input));
}

export async function submitRequirementAction(input: unknown) {
  return revalidate(await action(submitRequirement)(input));
}

export async function decideRequirementAction(input: unknown) {
  return revalidate(await action(decideRequirement)(input));
}

export async function signPlacementAgreementAction(input: unknown) {
  return revalidate(await action(signPlacementAgreement)(input));
}

export async function protectRecoveryAction(input: unknown) {
  return revalidate(await action(protectRecovery)(input));
}

export async function respondRedistributionInvitationAction(input: unknown) {
  return revalidate(await action(respondRedistributionInvitation)(input));
}

export async function closeRedistributionRoundAction(input: unknown) {
  return revalidate(await action(closeRedistributionRound)(input));
}

export async function resolveSelectionConflictAction(input: unknown) {
  return revalidate(await action(resolveSelectionConflict)(input));
}

export async function resetFixtureScenarioAction(formData: FormData) {
  if (process.env.NODE_ENV === 'production') return;
  const raw = formData.get('scenario');
  const scenario = FIXTURE_SCENARIO_NAMES.find((item) => item === raw);
  if (!scenario) return;
  await Promise.resolve(resetDevelopmentFixtures(scenario));
  revalidatePath('/', 'layout');
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
