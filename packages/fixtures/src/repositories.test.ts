import { describe, expect, it } from 'vitest';
import { createFixtureRepositories, createScenarioStore, createStore, ids } from '.';

describe('fixture repository contracts', () => {
  it('isolates every cycle-scoped collection', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const cycles = await repos.cycles.list();
    expect(cycles.ok).toBe(true);
    if (!cycles.ok) return;
    const first = cycles.data.find((row) => row.id === ids.cycle)!;
    const second = cycles.data.find((row) => row.id !== ids.cycle)!;
    const [firstPositions, secondPositions, firstStartups, secondStartups, secondIntents, firstIntents] =
      await Promise.all([
        repos.positions.listForCycle(first.id),
        repos.positions.listForCycle(second.id),
        repos.startups.listForCycle(first.id),
        repos.startups.listForCycle(second.id),
        repos.positionIntents.listForCycle(second.id),
        repos.positionIntents.listForCycle(first.id),
      ]);
    expect(firstPositions.ok && firstPositions.data.length).toBeGreaterThan(0);
    // The Autumn cycle has not reached the positions stage, so it has none —
    // which is the isolation this test is really about.
    expect(secondPositions.ok && secondPositions.data).toEqual([]);
    expect(secondStartups.ok && secondStartups.data.length).toBeGreaterThan(0);
    expect(firstStartups.ok && firstStartups.data.length).toBeGreaterThan(0);
    // Intents run the other way round: they belong to the cycle in `allocation`.
    expect(secondIntents.ok && secondIntents.data.length).toBeGreaterThan(0);
    expect(firstIntents.ok && firstIntents.data).toEqual([]);
  });

  it('acknowledges a published allocation idempotently and appends one immutable event', async () => {
    const repos = createFixtureRepositories(createStore());
    const first = await repos.participation.acknowledge(ids.cycle, ids.msheireb, ids.qstpOps, '2026-03-17T10:00:00.000Z');
    const second = await repos.participation.acknowledge(ids.cycle, ids.msheireb, ids.qstpOps, '2026-03-17T11:00:00.000Z');
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.allocationAcknowledgedAt).toBe(first.data.allocationAcknowledgedAt);
    const events = await repos.activity.listForEntity(ids.cycle, 'participation', first.data.id);
    expect(events.ok && events.data).toHaveLength(1);
  });

  it('keeps allocation revisions immutable while exposing only the live decision', async () => {
    const repos = createFixtureRepositories(createStore());
    const revised = await repos.allocations.decide({
      cycleId: ids.cycle,
      startupId: ids.acme,
      weeklyHours: 40,
      score: 91,
      justification: 'Adjusted to available supervision.',
      overrideReason: 'Reduced after review.',
      decidedBy: ids.qstpManager,
      decidedAt: '2026-03-18T10:00:00.000Z',
      redistributionRoundId: null,
    });
    expect(revised.ok && revised.data.revision).toBe(2);
    const history = await repos.allocations.listHistoryForCycle(ids.cycle);
    expect(history.ok && history.data.filter((row) => row.startupId === ids.acme)).toHaveLength(2);
    expect(history.ok && history.data.find((row) => row.startupId === ids.acme && row.revision === 1)?.status).toBe('superseded');
    const live = await repos.allocations.findForStartup(ids.cycle, ids.acme);
    expect(live.ok && live.data?.weeklyHours).toBe(40);
  });

  it('atomically declines sibling offers when the candidate accepts', async () => {
    const store = createScenarioStore('candidate_choice');
    const repos = createFixtureRepositories(store);
    const offers = store.selections.filter((row) => row.candidateId === ids.canHassan);
    const result = await repos.selections.acceptOffer({
      selectionId: offers[0]!.id,
      candidateId: ids.canHassan,
      acceptedAt: '2026-03-16T10:00:00.000Z',
    });
    expect(result.ok && result.data.status).toBe('accepted');
    expect(store.selections.find((row) => row.id === offers[1]!.id)?.status).toBe('declined');
  });

  it('walks candidate-choice fallback offers in offer-time order with a fresh deadline', async () => {
    const store = createScenarioStore('candidate_choice');
    const repos = createFixtureRepositories(store);
    const opened = await repos.fallbacks.open({
      cycleId: ids.cycle,
      candidateId: ids.canHassan,
      responseDeadline: '2026-03-23T10:00:00.000Z',
      openedBy: ids.qstpOps,
      occurredAt: '2026-03-21T10:00:00.000Z',
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const declined = await repos.fallbacks.respond({
      caseId: opened.data.id,
      response: 'declined',
      actorId: ids.qstpOps,
      nextResponseDeadline: '2026-03-25T10:00:00.000Z',
      occurredAt: '2026-03-22T10:00:00.000Z',
    });
    expect(declined.ok && declined.data.currentOfferIndex).toBe(1);
    expect(declined.ok && declined.data.responseDeadline).toBe('2026-03-25T10:00:00.000Z');
    const accepted = await repos.fallbacks.respond({
      caseId: opened.data.id,
      response: 'accepted',
      actorId: ids.qstpOps,
      nextResponseDeadline: null,
      occurredAt: '2026-03-24T10:00:00.000Z',
    });
    expect(accepted.ok && accepted.data.status).toBe('accepted');
    expect(store.selections.filter((row) => row.candidateId === ids.canHassan && row.status === 'accepted')).toHaveLength(1);
  });

  it('never lets a candidate submit another candidate task', async () => {
    const repos = createFixtureRepositories(createStore());
    const assignment = await repos.tasks.assign({
      cycleId: ids.cycle,
      templateId: null,
      positionId: ids.posAiDev,
      candidateId: ids.canOmar,
      status: 'assigned',
      dueAt: '2026-03-18T10:00:00.000Z',
      submittedAt: null,
      lateAccepted: false,
      fileName: null,
      linkUrl: null,
      reviewNotes: null,
      reviewedBy: null,
      occurredAt: '2026-03-16T10:00:00.000Z',
    });
    expect(assignment.ok).toBe(true);
    if (!assignment.ok) return;
    const result = await repos.tasks.submit(
      assignment.data.id,
      ids.canLayla,
      'answer.pdf',
      null,
      '2026-03-17T10:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
  });

  it('requires candidate acceptance, prevents seat overfill, and fills the final seat atomically', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const reservation = store.selections.find(
      (row) => row.candidateId === ids.canOmar && row.startupId === ids.acme,
    )!;
    const tooEarly = await repos.placements.confirmSelection(reservation.id, {
      startsOn: '2026-04-01',
      endsOn: '2026-07-01',
      supervisorId: ids.acmeSupervisor,
      supervisorName: 'Karim Nasser',
      confirmedBy: ids.qstpOps,
      occurredAt: '2026-03-18T10:00:00.000Z',
    });
    expect(tooEarly.ok).toBe(false);
    await repos.selections.acceptReservation({
      selectionId: reservation.id,
      candidateId: ids.canOmar,
      acceptedAt: '2026-03-18T11:00:00.000Z',
    });
    const confirmed = await repos.placements.confirmSelection(reservation.id, {
      startsOn: '2026-04-01',
      endsOn: '2026-07-01',
      supervisorId: ids.acmeSupervisor,
      supervisorName: 'Karim Nasser',
      confirmedBy: ids.qstpOps,
      occurredAt: '2026-03-18T12:00:00.000Z',
    });
    expect(confirmed.ok).toBe(true);
    expect(store.positions.find((row) => row.id === ids.posAiDev)?.status).toBe('filled');
    const repeat = await repos.placements.confirmSelection(reservation.id, {
      startsOn: '2026-04-01',
      endsOn: '2026-07-01',
      supervisorId: ids.acmeSupervisor,
      supervisorName: 'Karim Nasser',
      confirmedBy: ids.qstpOps,
      occurredAt: '2026-03-18T13:00:00.000Z',
    });
    expect(repeat.ok).toBe(false);
  });

  it('preserves requirement revisions and extracted versus confirmed values', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const requirement = store.placementRequirements[1]!;
    const correction = await repos.requirements.decide({
      requirementId: requirement.id,
      decision: 'correction_requested',
      reason: 'IBAN must be corrected.',
      occurredAt: '2026-03-16T10:00:00.000Z',
    });
    expect(correction.ok).toBe(true);
    const first = await repos.requirements.submit({
      requirementId: requirement.id,
      fileName: 'bank-v1.pdf',
      submittedBy: ids.candidateUser,
      extractedFields: [{ key: 'iban', extracted: 'QA58O', confirmed: 'QA580' }],
      occurredAt: '2026-03-17T10:00:00.000Z',
    });
    expect(first.ok).toBe(true);
    await repos.requirements.decide({
      requirementId: requirement.id,
      decision: 'correction_requested',
      reason: 'Account name is missing.',
      occurredAt: '2026-03-17T11:00:00.000Z',
    });
    const second = await repos.requirements.submit({
      requirementId: requirement.id,
      fileName: 'bank-v2.pdf',
      submittedBy: ids.candidateUser,
      extractedFields: [{ key: 'iban', extracted: 'QA580', confirmed: 'QA580' }],
      occurredAt: '2026-03-18T10:00:00.000Z',
    });
    expect(second.ok && second.data.revision).toBe(2);
    const revisions = await repos.requirements.listSubmissions(requirement.id);
    expect(revisions.ok && revisions.data.map((row) => row.revision)).toEqual([1, 2]);
    expect(revisions.ok && revisions.data[0]?.extractedFields[0]).toEqual({
      key: 'iban',
      extracted: 'QA58O',
      confirmed: 'QA580',
    });
  });

  it('refuses recovery while an exception protects the hours', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const protectedCase = store.recoveryCases.find((row) => row.status === 'exception_protected')!;
    const result = await repos.recovery.confirm(protectedCase.id, ids.qstpManager, '2026-03-16T10:00:00.000Z');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('reuses recovered budget through a versioned round grant and can open another round', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const firstCase = store.recoveryCases.find((row) => row.status === 'potential')!;
    const confirmed = await repos.recovery.confirm(
      firstCase.id,
      ids.qstpManager,
      '2026-03-16T10:00:00.000Z',
    );
    if (!confirmed.ok) throw confirmed.error;
    const firstRound = await repos.recovery.createRound({
      cycleId: ids.cycle,
      recoveryCaseIds: [firstCase.id],
      positionDeadline: '2026-03-20T10:00:00.000Z',
      selectionDeadline: '2026-03-25T10:00:00.000Z',
      createdBy: ids.qstpManager,
      occurredAt: '2026-03-16T11:00:00.000Z',
    });
    expect(firstRound.ok).toBe(true);
    if (!firstRound.ok) return;
    await repos.recovery.invite(
      firstRound.data.id,
      ids.lusail,
      40,
      '2026-03-16T12:00:00.000Z',
    );
    const accepted = await repos.recovery.respond(
      firstRound.data.id,
      ids.lusail,
      'accepted',
      '2026-03-16T13:00:00.000Z',
    );
    expect(accepted.ok).toBe(true);
    const fintech = await repos.allocations.findForStartup(ids.cycle, ids.fintech);
    const lusail = await repos.allocations.findForStartup(ids.cycle, ids.lusail);
    expect(fintech.ok && fintech.data?.weeklyHours).toBe(0);
    expect(lusail.ok && lusail.data?.weeklyHours).toBe(40);
    const history = await repos.allocations.listHistoryForCycle(ids.cycle);
    expect(
      history.ok &&
        history.data.some(
          (row) => row.startupId === ids.lusail && row.redistributionRoundId === firstRound.data.id,
        ),
    ).toBe(true);
    await repos.recovery.closeRound(firstRound.data.id, '2026-03-30T10:00:00.000Z');

    const replacementCase = await repos.placements.cancel(
      store.placements[0]!.id,
      'Candidate withdrew.',
      ids.qstpManager,
      '2026-04-01T10:00:00.000Z',
    );
    if (!replacementCase.ok) throw replacementCase.error;
    await repos.recovery.confirm(
      replacementCase.data.recoveryCase.id,
      ids.qstpManager,
      '2026-04-01T11:00:00.000Z',
    );
    const secondRound = await repos.recovery.createRound({
      cycleId: ids.cycle,
      recoveryCaseIds: [replacementCase.data.recoveryCase.id],
      positionDeadline: '2026-04-04T10:00:00.000Z',
      selectionDeadline: '2026-04-08T10:00:00.000Z',
      createdBy: ids.qstpManager,
      occurredAt: '2026-04-01T12:00:00.000Z',
    });
    expect(secondRound.ok && secondRound.data.number).toBe(2);
  });

  it('cancels without overwriting placement history and creates a recovery case', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const original = store.placements[0]!;
    const result = await repos.placements.cancel(
      original.id,
      'Candidate withdrew.',
      ids.qstpManager,
      '2026-03-20T10:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.placement.id).toBe(original.id);
    expect(result.data.placement.status).toBe('cancelled');
    expect(result.data.recoveryCase.placementId).toBe(original.id);
    expect(store.placements).toHaveLength(1);
  });

  it('allows Ready to Start only after the complete checklist, signatures, and four confirmations', async () => {
    const store = createStore();
    const repos = createFixtureRepositories(store);
    const placement = store.placements[0]!;
    const blocked = await repos.placements.markReady(placement.id, '2026-03-18T09:00:00.000Z');
    expect(blocked.ok).toBe(false);
    for (const requirement of store.placementRequirements.filter((row) => row.status !== 'approved')) {
      const decided = await repos.requirements.decide({
        requirementId: requirement.id,
        decision: requirement.owner === 'startup' ? 'waived' : 'approved',
        reason: requirement.owner === 'startup' ? 'Covered by the signed agreement.' : null,
        occurredAt: '2026-03-18T10:00:00.000Z',
      });
      expect(decided.ok).toBe(true);
    }
    await repos.requirements.sign({
      placementId: placement.id,
      kind: 'qstp_agreement',
      signerId: ids.qstpOps,
      signerName: 'Faisal Al-Marri',
      declarationAccepted: true,
      documentOpenedAt: '2026-03-18T10:30:00.000Z',
      signedAt: '2026-03-18T10:31:00.000Z',
    });
    await repos.requirements.sign({
      placementId: placement.id,
      kind: 'startup_agreement',
      signerId: ids.acmeOwner,
      signerName: 'Dana Habib',
      declarationAccepted: true,
      documentOpenedAt: '2026-03-18T10:40:00.000Z',
      signedAt: '2026-03-18T10:41:00.000Z',
    });
    // Two of three. The candidate's own signature is still outstanding, and that
    // alone must hold the placement back.
    const twoOfThree = await repos.placements.markReady(placement.id, '2026-03-18T10:45:00.000Z');
    expect(twoOfThree.ok).toBe(false);
    await repos.requirements.sign({
      placementId: placement.id,
      kind: 'candidate_agreement',
      signerId: ids.userLayla,
      signerName: 'Layla Haddad',
      declarationAccepted: true,
      documentOpenedAt: '2026-03-18T10:50:00.000Z',
      signedAt: '2026-03-18T10:51:00.000Z',
    });
    await repos.placements.setReadiness({
      placementId: placement.id,
      party: 'startup',
      actorId: ids.acmeOwner,
      occurredAt: '2026-03-18T11:00:00.000Z',
    });
    await repos.placements.setReadiness({
      placementId: placement.id,
      party: 'qstp',
      actorId: ids.qstpOps,
      occurredAt: '2026-03-18T11:01:00.000Z',
    });
    const ready = await repos.placements.markReady(placement.id, '2026-03-18T12:00:00.000Z');
    expect(ready.ok && ready.data.status).toBe('ready_to_start');
    const onboarded = await repos.placements.onboard(placement.id, '2026-04-12T08:00:00.000Z');
    expect(onboarded.ok && onboarded.data.status).toBe('onboarded');
  });
});
