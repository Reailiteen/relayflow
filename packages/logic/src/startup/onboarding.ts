import { z } from 'zod';
import { err, notFound, ok } from '@relayflow/core';
import { ANY_STARTUP, isStartup } from '@relayflow/access';
import {
  needsCandidateAction,
  type Candidate,
  type CandidateDocument,
  type Position,
  type Selection,
  type StartupId,
} from '@relayflow/entities';
import { defineUseCase } from '../use-case';

/**
 * What a startup may see of its interns' onboarding.
 *
 * This is the most privacy-sensitive read in the product, and its shape is the
 * design. A startup needs to know whether its intern can start on Monday. It
 * does not need — and must never be given — their national ID number or their
 * IBAN. So this returns *counts and states*, never field values, for everything
 * except the one document the startup itself owns: its own NDA.
 *
 * The rule is enforced by what is constructed here rather than by remembering
 * not to render something. There is no field data in the returned shape to
 * leak.
 */

function actingStartup(actor: Parameters<typeof isStartup>[0]): StartupId | null {
  if (!isStartup(actor)) return null;
  return actor.affiliations.find((a) => a.status === 'active')?.startupId ?? null;
}

export interface InternOnboarding {
  readonly candidate: Pick<Candidate, 'id' | 'fullName' | 'email'>;
  readonly position: Position | null;
  readonly selection: Selection;
  /** Progress only — how many, in what state. Never what they contain. */
  readonly documentsTotal: number;
  readonly documentsVerified: number;
  readonly documentsOutstanding: number;
  readonly readyToStart: boolean;
  /** The startup's own NDA for this intern, which it is allowed to see. */
  readonly nda: CandidateDocument | null;
}

export interface StartupOnboarding {
  readonly interns: readonly InternOnboarding[];
  readonly documentDeadline: string;
}

export const getStartupOnboarding = defineUseCase({
  name: 'startup.onboarding',
  input: z.object({}),
  authorize: { capability: 'document:read_own' as const, startupId: ANY_STARTUP },

  execute: async (ctx) => {
    const startupId = actingStartup(ctx.actor);
    if (!startupId) return err(notFound('You are not affiliated with a startup.'));

    const cycleResult = await ctx.repos.cycles.findActive();
    if (!cycleResult.ok) return cycleResult;
    const cycle = cycleResult.data;
    if (!cycle) return err(notFound('There is no active cycle.'));

    const [selections, positions, ourDocuments] = await Promise.all([
      ctx.repos.selections.listForCycle(cycle.id),
      ctx.repos.positions.listForStartup(cycle.id, startupId),
      ctx.repos.documents.listForStartup(startupId),
    ]);
    if (!selections.ok) return err(selections.error);
    if (!positions.ok) return err(positions.error);
    if (!ourDocuments.ok) return err(ourDocuments.error);

    // Only people actually joining this startup. A reservation is not yet an
    // intern, so onboarding does not list one.
    const ours = selections.data.filter(
      (selection) => selection.startupId === startupId && selection.status === 'confirmed',
    );

    const interns: InternOnboarding[] = [];

    for (const selection of ours) {
      const candidate = await ctx.repos.candidates.findById(selection.candidateId);
      if (!candidate.ok) return err(candidate.error);
      if (!candidate.data) continue;

      const documents = await ctx.repos.documents.listForCandidate(selection.candidateId);
      if (!documents.ok) return err(documents.error);

      const verified = documents.data.filter((doc) => doc.status === 'verified').length;
      const outstanding = documents.data.filter((doc) => needsCandidateAction(doc.status)).length;

      interns.push({
        // Reduced deliberately: name and email are what a supervisor needs to
        // make contact, and nothing else on the candidate is theirs to read.
        candidate: {
          id: candidate.data.id,
          fullName: candidate.data.fullName,
          email: candidate.data.email,
        },
        position: positions.data.find((p) => p.id === selection.positionId) ?? null,
        selection,
        documentsTotal: documents.data.length,
        documentsVerified: verified,
        documentsOutstanding: outstanding,
        readyToStart: documents.data.length > 0 && verified === documents.data.length,
        nda:
          ourDocuments.data.find(
            (doc) => doc.candidateId === selection.candidateId && doc.kind === 'startup_nda',
          ) ?? null,
      });
    }

    return ok<StartupOnboarding>({
      interns,
      documentDeadline: cycle.deadlines.documentSubmission,
    });
  },
});
