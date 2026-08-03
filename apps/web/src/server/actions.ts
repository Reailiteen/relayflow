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
  decideCycleException,
  grantHours,
  importCandidates,
  markAllNotificationsRead,
  updateNotificationPreference,
  updateReminderRule,
  markNotificationRead,
  moveCandidateCard,
  movePositionCard,
  moveStartupCard,
  reclaimHours,
  attachRecording,
  requestException,
  requestCycleException,
  requestCycleInterview,
  saveInterviewFeedback,
  saveCycleInterviewFeedback,
  scheduleInterview,
  resolveConflict,
  reviewPosition,
  sharePool,
  selectCandidate,
  submitPosition,
  uploadDocument,
  prepareDocumentUpload,
  getDocumentDownloadUrl,
  recordDocumentExtraction,
  verifyDocument,
  acknowledgeAllocation,
  amendPlacementRequirement,
  adjustPrioritization,
  archiveCycle,
  draftStartupRating,
  submitStartupRating,
  submitPositionIntent,
  advanceCycleStage,
  cancelPlacement,
  closeRedistributionRound,
  confirmPlacement,
  createCycle,
  confirmRecovery,
  createRedistributionRound,
  decideRequirement,
  finalizePlacement,
  expireRedistributionInvitations,
  inviteRedistribution,
  openCandidateChoiceFallback,
  overrideCandidateChoice,
  protectRecovery,
  publishAllocations,
  runPrioritization,
  setPlacementReadiness,
  saveParticipation,
  savePosition,
  saveRequirementTemplate,
  saveTaskTemplate,
  submitRequirement,
  submitTask,
  reviewTask,
  resolveSelectionConflict,
  respondCandidateChoiceFallback,
  respondRedistributionInvitation,
  transitionPosition,
  transitionCycleInterview,
  updateCycle,
  updateRequirementTemplate,
  withdrawTask,
} from '@relayflow/logic';
import { action, type ActionResult } from './action';
import { DEV_ACTOR_COOKIE, FIXTURE_SCENARIO_NAMES, resetDevelopmentFixtures } from './context';
import { accountForPersona, signIn, signOut } from './auth';

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

export async function saveCycleInterviewFeedbackAction(input: unknown) {
  return revalidate(await action(saveCycleInterviewFeedback)(input));
}

/**
 * Reading a notification.
 *
 * Revalidating the whole layout is what keeps the bell badge, the dropdown and
 * the notification page from disagreeing after a click — they are three
 * renderings of one count, and none of them holds its own copy.
 */
export async function markNotificationReadAction(input: unknown) {
  return revalidate(await action(markNotificationRead)(input));
}

export async function markAllNotificationsReadAction(input: unknown) {
  return revalidate(await action(markAllNotificationsRead)(input));
}

/**
 * Reminder settings.
 *
 * Both revalidate the layout rather than the settings page alone: turning a
 * rule off changes what the whole application will say from now on, and a
 * cached panel elsewhere still promising the old behaviour is exactly the kind
 * of disagreement that makes people distrust the switch.
 */
export async function updateReminderRuleAction(input: unknown) {
  return revalidate(await action(updateReminderRule)(input));
}

export async function updateNotificationPreferenceAction(input: unknown) {
  return revalidate(await action(updateNotificationPreference)(input));
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

/**
 * Uploading, in two calls.
 *
 * The first mints a URL the browser PUTs to directly; the second records that
 * the file arrived. Splitting them is what keeps several megabytes of ID photo
 * off the Next server — and, more importantly, means the storage policy decides
 * whether the write is allowed before any of those megabytes move.
 *
 * Neither takes a storage path. Both compute the same one from ids the server
 * already holds, so there is no request in which a candidate can name a folder.
 */
export async function prepareDocumentUploadAction(input: unknown) {
  // Deliberately not revalidated: nothing has changed yet.
  return action(prepareDocumentUpload)(input);
}

export async function documentDownloadUrlAction(input: unknown) {
  return action(getDocumentDownloadUrl)(input);
}

export async function recordDocumentExtractionAction(input: unknown) {
  return revalidate(await action(recordDocumentExtraction)(input));
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

export async function savePositionAction(input: unknown) {
  return revalidate(await action(savePosition)(input));
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

export async function adjustPrioritizationAction(input: unknown) {
  return revalidate(await action(adjustPrioritization)(input));
}

export async function publishAllocationsAction(input: unknown) {
  return revalidate(await action(publishAllocations)(input));
}

export async function draftStartupRatingAction(input: unknown) {
  return revalidate(await action(draftStartupRating)(input));
}

export async function submitStartupRatingAction(input: unknown) {
  return revalidate(await action(submitStartupRating)(input));
}

export async function submitPositionIntentAction(input: unknown) {
  return revalidate(await action(submitPositionIntent)(input));
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

export async function withdrawTaskAction(input: unknown) {
  return revalidate(await action(withdrawTask)(input));
}

export async function saveRequirementTemplateAction(input: unknown) {
  return revalidate(await action(saveRequirementTemplate)(input));
}

export async function amendPlacementRequirementAction(input: unknown) {
  return revalidate(await action(amendPlacementRequirement)(input));
}

export async function updateRequirementTemplateAction(input: unknown) {
  return revalidate(await action(updateRequirementTemplate)(input));
}

export async function submitRequirementAction(input: unknown) {
  return revalidate(await action(submitRequirement)(input));
}

export async function decideRequirementAction(input: unknown) {
  return revalidate(await action(decideRequirement)(input));
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

export async function expireRedistributionInvitationsAction(input: unknown) {
  return revalidate(await action(expireRedistributionInvitations)(input));
}

export async function resolveSelectionConflictAction(input: unknown) {
  return revalidate(await action(resolveSelectionConflict)(input));
}

export async function requestCycleInterviewAction(input: unknown) {
  return revalidate(await action(requestCycleInterview)(input));
}

export async function transitionCycleInterviewAction(input: unknown) {
  return revalidate(await action(transitionCycleInterview)(input));
}

export async function requestCycleExceptionAction(input: unknown) {
  return revalidate(await action(requestCycleException)(input));
}

export async function decideCycleExceptionAction(input: unknown) {
  return revalidate(await action(decideCycleException)(input));
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
  const rawEmail = formData.get('email');
  const rawPassword = formData.get('password');
  const email = typeof rawEmail === 'string' ? rawEmail : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!email.trim()) return { error: 'Enter your email address.' };

  const outcome = await signIn(email, password);
  if (!outcome.ok || !outcome.account) {
    return { error: outcome.error ?? 'Could not sign you in.' };
  }

  // Recorded even with a live Supabase session: the repositories are still
  // fixtures, so this is what tells them which seeded person you are. It goes
  // away with the data cutover.
  const store = await cookies();
  store.set(DEV_ACTOR_COOKIE, outcome.account.persona, { path: '/', maxAge: 60 * 60 * 24 });

  revalidatePath('/', 'layout');
  redirect(outcome.account.destination);
}

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
  await signOut();
  const store = await cookies();
  store.delete(DEV_ACTOR_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/signin');
}
