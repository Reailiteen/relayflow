import { describe, expect, it } from 'vitest';
import { fixedClock } from '@relayflow/core';
import {
  DEV_ACTORS,
  createFixtureRepositories,
  createStore,
  ids,
  type FixtureStore,
} from '@relayflow/fixtures';
import { silentLogger } from '@relayflow/logger';
import type { CandidateActor } from '@relayflow/access';
import { blocksOthers } from '@relayflow/entities';
import type { UseCaseContext } from '../context';
import { getQstpDashboard } from '../qstp/dashboard';
import { getCandidateOffers } from '../candidate/views';
import { selectCandidate } from './select-candidate';
import { acceptOffer } from './accept-offer';

/**
 * Candidate-choice selection, end to end.
 *
 * The seeded cycle runs first-come, so each test opts its own store into the
 * new mode. That is deliberate: it keeps every other suite exercising the
 * original behaviour, and it means these tests assert the mode is *read from
 * the cycle* rather than assumed.
 *
 * Omar is the subject throughout — he is in two pools belonging to two
 * different startups, which is exactly the situation the mode exists for.
 */

const NOW = '2026-03-16T09:00:00.000Z';
const WINDOW_CLOSES = '2026-03-20T23:59:00.000Z';

/** A store in candidate-choice mode, with Omar's seeded claims cleared. */
function choiceStore(): FixtureStore {
  const store = createStore();
  store.cycles[0] = {
    ...store.cycles[0]!,
    selectionMode: 'candidate_choice',
    deadlines: { ...store.cycles[0]!.deadlines, offerWindow: WINDOW_CLOSES },
  };
  // The seed has Acme holding Omar first-come. Offers cannot be made against a
  // blocking claim, so the fixture starts him unclaimed.
  store.selections = store.selections.filter((s) => s.candidateId !== ids.canOmar);
  return store;
}

function contextFor(actor: UseCaseContext['actor'], store: FixtureStore): UseCaseContext {
  return {
    actor,
    repos: createFixtureRepositories(store),
    logger: silentLogger,
    clock: fixedClock(NOW),
  };
}

const omar = (): CandidateActor => ({
  kind: 'candidate',
  userId: ids.candidateUser,
  email: 'omar.khalid@example.com',
  fullName: 'Omar Khalid',
  candidateId: ids.canOmar,
});

/** Both startups express interest in Omar. Returns the two claims. */
async function twoOffers(store: FixtureStore) {
  const acme = await selectCandidate(contextFor(DEV_ACTORS.startupOwner(), store), {
    positionId: ids.posAiDev,
    candidateId: ids.canOmar,
  });
  const northwind = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
    positionId: ids.posDataAnalyst,
    candidateId: ids.canOmar,
  });
  return { acme, northwind };
}

describe('candidate-choice selection', () => {
  it('lets two startups offer the same candidate without either being refused', async () => {
    const store = choiceStore();
    const { acme, northwind } = await twoOffers(store);

    // Under first-come the second of these is a conflict error. Here both win.
    expect(acme.ok).toBe(true);
    expect(northwind.ok).toBe(true);
    if (!acme.ok || !northwind.ok) return;

    expect(acme.data.status).toBe('offered');
    expect(northwind.data.status).toBe('offered');
    // Neither offer blocks — that is what lets the second one exist at all.
    const omarsClaims = store.selections.filter((s) => s.candidateId === ids.canOmar);
    expect(omarsClaims).toHaveLength(2);
    expect(omarsClaims.filter((s) => blocksOthers(s.status))).toEqual([]);
  });

  it('reads the mode from the cycle, so the same call reserves under first-come', async () => {
    // Same input, same actor, same candidate — only the cycle differs.
    const store = createStore();
    store.selections = store.selections.filter((s) => s.candidateId !== ids.canOmar);
    store.selectionConflicts = [];

    const result = await selectCandidate(contextFor(DEV_ACTORS.startupOwner(), store), {
      positionId: ids.posAiDev,
      candidateId: ids.canOmar,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('reserved');

    // And the second startup is refused, as it always was.
    const second = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
      positionId: ids.posDataAnalyst,
      candidateId: ids.canOmar,
    });
    expect(second.ok).toBe(false);
    expect(store.selectionConflicts).toHaveLength(1);
    expect(store.selectionConflicts[0]?.status).toBe('open');
  });

  it('declines the sibling offers when the candidate accepts one', async () => {
    const store = choiceStore();
    const { northwind } = await twoOffers(store);
    if (!northwind.ok) return;

    const accepted = await acceptOffer(contextFor(omar(), store), {
      selectionId: northwind.data.id,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    expect(accepted.data.status).toBe('accepted');
    expect(accepted.data.acceptedAt).toBe(NOW);
    // The offer time survives acceptance — it is the fallback's ordering.
    expect(accepted.data.offeredAt).not.toBeNull();

    const omarsClaims = store.selections.filter((s) => s.candidateId === ids.canOmar);
    expect(omarsClaims.filter((s) => blocksOthers(s.status))).toHaveLength(1);
    expect(omarsClaims.filter((s) => s.status === 'declined')).toHaveLength(1);
    // No offer is left open — a candidate cannot be mid-decision after deciding.
    expect(omarsClaims.filter((s) => s.status === 'offered')).toHaveLength(0);
  });

  it('refuses a candidate reaching for an offer that is not theirs', async () => {
    const store = choiceStore();
    const { northwind } = await twoOffers(store);
    if (!northwind.ok) return;

    const layla: CandidateActor = {
      kind: 'candidate',
      userId: ids.candidateUser,
      email: 'layla.ahmed@example.com',
      fullName: 'Layla Ahmed',
      candidateId: ids.canLayla,
    };

    const stolen = await acceptOffer(contextFor(layla, store), {
      selectionId: northwind.data.id,
    });
    expect(stolen.ok).toBe(false);
    // Not found rather than forbidden: a valid id belonging to someone else
    // must not be confirmed as existing.
    if (!stolen.ok) expect(stolen.error.code).toBe('not_found');
  });

  it('refuses a second acceptance once the candidate has chosen', async () => {
    const store = choiceStore();
    const { acme, northwind } = await twoOffers(store);
    if (!acme.ok || !northwind.ok) return;

    await acceptOffer(contextFor(omar(), store), { selectionId: northwind.data.id });
    const again = await acceptOffer(contextFor(omar(), store), { selectionId: acme.data.id });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('conflict');
  });

  it('refuses an offer once the window has closed', async () => {
    const store = choiceStore();
    store.cycles[0] = {
      ...store.cycles[0]!,
      deadlines: { ...store.cycles[0]!.deadlines, offerWindow: '2026-03-15T23:59:00.000Z' },
    };

    const late = await selectCandidate(contextFor(DEV_ACTORS.startupOwner(), store), {
      positionId: ids.posAiDev,
      candidateId: ids.canOmar,
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe('conflict');
  });

  it('will not offer a candidate someone already holds', async () => {
    // Acme reserved Omar under first-come; the cycle then switches mode. The
    // reservation still blocks, or the candidate would be shown a choice
    // between an offer and a role that is already gone.
    const store = createStore();
    store.cycles[0] = {
      ...store.cycles[0]!,
      selectionMode: 'candidate_choice',
      deadlines: { ...store.cycles[0]!.deadlines, offerWindow: WINDOW_CLOSES },
    };

    const blocked = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
      positionId: ids.posDataAnalyst,
      candidateId: ids.canOmar,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('conflict');
  });

  it('will not offer a candidate who is no longer available', async () => {
    const store = choiceStore();
    const yusuf = store.candidates.find((c) => c.id === ids.canYusuf);
    expect(yusuf?.availability).toBe('employed');

    const result = await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
      positionId: ids.posDataAnalyst,
      candidateId: ids.canYusuf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('conflict');
  });

  it('never counts an offer against the budget', async () => {
    const store = choiceStore();

    const before = await getQstpDashboard(contextFor(DEV_ACTORS.manager(), store), {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    await twoOffers(store);

    const after = await getQstpDashboard(contextFor(DEV_ACTORS.manager(), store), {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    // Two startups wanting the same person is interest, not two commitments.
    // If offers reached `committed`, this is where the budget double-counts.
    expect(after.data.budget.committed).toBe(before.data.budget.committed);
  });

  it('shows the candidate every offer, and calls it a choice only when it is one', async () => {
    const store = choiceStore();

    await selectCandidate(contextFor(DEV_ACTORS.startupOwner(), store), {
      positionId: ids.posAiDev,
      candidateId: ids.canOmar,
    });

    const one = await getCandidateOffers(contextFor(omar(), store), {});
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(one.data.offers).toHaveLength(1);
    // One offer is not a choice — there is nothing to weigh it against.
    expect(one.data.isAChoice).toBe(false);

    await selectCandidate(contextFor(DEV_ACTORS.lateStartup(), store), {
      positionId: ids.posDataAnalyst,
      candidateId: ids.canOmar,
    });

    const two = await getCandidateOffers(contextFor(omar(), store), {});
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    expect(two.data.offers).toHaveLength(2);
    expect(two.data.isAChoice).toBe(true);
    expect(two.data.accepted).toBeNull();
    expect(two.data.closesAt).toBe(WINDOW_CLOSES);
    // Both startups are named. This is the one place competing interest is
    // shown, and it is shown to the person deciding — never to the startups.
    expect(two.data.offers.map((o) => o.startup?.name).sort()).toEqual([
      'Acme Robotics',
      'Northwind Analytics',
    ]);
  });

  it('shows the accepted offer as the outcome once chosen', async () => {
    const store = choiceStore();
    const { northwind } = await twoOffers(store);
    if (!northwind.ok) return;

    await acceptOffer(contextFor(omar(), store), { selectionId: northwind.data.id });

    const view = await getCandidateOffers(contextFor(omar(), store), {});
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.data.offers).toEqual([]);
    expect(view.data.accepted?.startup?.name).toBe('Northwind Analytics');
  });
});
