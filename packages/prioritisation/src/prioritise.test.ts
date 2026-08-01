import { describe, expect, it } from 'vitest';

import expectedOutput from './contracts/examples/expected-output.json';
import minimalInput from './contracts/examples/minimal-input.json';
import { DEFAULT_POLICY } from './policy';
import { buildPortfolioDraft } from './prioritise';
import type { PortfolioInput } from './types';

const input = minimalInput as unknown as PortfolioInput;

describe('buildPortfolioDraft', () => {
  /**
   * The acceptance test for the whole port.
   *
   * The fixture covers a top-priority startup, an exact-score tie, a budget
   * downgrade, a waitlisted startup and an infeasible position. `toStrictEqual`
   * rather than `toEqual` on purpose: a TypeScript port produces `undefined`
   * where the original produced `null`, and that difference must fail.
   */
  it('reproduces the golden portfolio exactly', () => {
    expect(buildPortfolioDraft(input)).toStrictEqual(expectedOutput);
  });

  it('keeps incomplete startups visible and marks the draft partial', () => {
    const [first, second] = input.startups;
    if (first === undefined || second === undefined) throw new Error('fixture is malformed');

    const result = buildPortfolioDraft({
      ...input,
      startups: [
        { ...first, startupId: 'no-extraction', extraction: null },
        { ...second, startupId: 'no-ratings', qstpRatings: null },
      ],
    });

    expect(result.runStatus).toBe('partial_draft');
    expect(result.startups.map((startup) => startup.status)).toStrictEqual([
      'needs_information',
      'awaiting_manual_scores',
    ]);
    expect(result.counts.submitted).toBe(2);
    // Neither is waitlisted. A blocked startup is not a startup we scored last.
    expect(result.counts.waitlisted).toBe(0);
    expect(result.budget.proposedHours).toBe(0);
  });

  it('treats invalid ratings as review work, not a crashed portfolio', () => {
    const [first] = input.startups;
    if (first === undefined || first.qstpRatings === null) throw new Error('fixture is malformed');

    const result = buildPortfolioDraft({
      ...input,
      startups: [{ ...first, qstpRatings: { ...first.qstpRatings, tractionStrength: 5 } }],
    });

    expect(result.startups[0]?.status).toBe('awaiting_manual_scores');
    expect(result.startups[0]?.blockers[0]?.type).toBe('invalid_qstp_ratings');
  });

  it('rejects duplicate startup ids before calculating anything', () => {
    const [first, second] = input.startups;
    if (first === undefined || second === undefined) throw new Error('fixture is malformed');

    expect(() =>
      buildPortfolioDraft({
        ...input,
        startups: [first, { ...second, startupId: first.startupId }],
      }),
    ).toThrow(/duplicate startupId/);
  });

  it('rejects a malformed policy snapshot before calculating anything', () => {
    expect(() =>
      buildPortfolioDraft({
        ...input,
        policy: { ...DEFAULT_POLICY, thresholds: [...DEFAULT_POLICY.thresholds].reverse() },
      }),
    ).toThrow(/thresholds must descend/);
  });

  /**
   * A drift canary. Changing the policy changes what every stored run means, so
   * it must be a deliberate act accompanied by a regenerated fixture — never a
   * side effect of tuning something else.
   */
  it('pins the policy version the golden fixture was generated against', () => {
    expect(DEFAULT_POLICY.version).toBe('prioritization-v3-experiment-2');
    expect(expectedOutput.policyVersion).toBe(DEFAULT_POLICY.version);
  });
});
