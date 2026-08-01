import { describe, expect, it } from 'vitest';

import { evaluateV3Positions } from './normalisation';
import { DEFAULT_POLICY } from './policy';

describe('evaluateV3Positions', () => {
  /**
   * A live run once rejected seven genuinely valid roles because the documents
   * said "Yes" and "75 minutes/week" rather than `true` and `75`. That was a
   * harness defect being read as a policy result.
   */
  it('canonicalises document-native readiness values', () => {
    const [result] = evaluateV3Positions(
      [
        {
          title: 'AI Intern',
          category: 'AI_ENGINEERING',
          expectedDeliverable: 'A tested prototype',
          learningOutcomes: 'Build and validate a reproducible result',
          workMode: 'Hybrid',
          supervisor: 'Aisha - Technical Lead',
          relevantExperience: '6 years',
          directSupervision: '75 minutes/week',
          maximumInterns: '1',
          resourcesReady: 'Yes',
          onboardingReady: 'Yes',
        },
      ],
      DEFAULT_POLICY,
    );

    expect(result?.feasible).toBe(true);
    expect(result?.canonical.weeklySupervisionMinutes).toBe(75);
    expect(result?.canonical.maximumInterns).toBe(1);
    expect(result?.canonical.resourcesReady).toBe(true);
  });

  it('blocks positions with no capacity, resources, or onboarding', () => {
    const [result] = evaluateV3Positions(
      [
        {
          title: 'Observer',
          category: 'software_engineering',
          // Placeholder prose is not a deliverable.
          expectedDeliverable: 'A deliverable has not yet been defined.',
          learningOutcomes: 'Observe work',
          workMode: 'onsite',
          supervisor: { name: 'Supervisor' },
          directSupervision: '15 minutes/week',
          maximumInterns: 0,
          resourcesReady: false,
          onboardingReady: false,
        },
      ],
      DEFAULT_POLICY,
    );

    expect(result?.feasible).toBe(false);
    expect(result?.checks.expectedDeliverable).toBe(false);
    expect(result?.checks.supervisorCapacity).toBe(false);
    expect(result?.checks.supervisionCommitment).toBe(false);
  });

  it('accepts every minutes-per-week field variant live extraction produces', () => {
    const common = {
      title: 'Data Intern',
      category: 'data_analytics',
      expectedDeliverable: 'A tested dashboard',
      learningOutcomes: ['Define metrics'],
      workMode: 'hybrid',
      maximumInterns: 1,
      resourcesReady: true,
      onboardingReady: true,
    };

    const [topLevel] = evaluateV3Positions(
      [{ ...common, supervisor: { name: 'Supervisor' }, directSupervisionMinutesPerWeek: 75 }],
      DEFAULT_POLICY,
    );
    const [nested] = evaluateV3Positions(
      [
        {
          ...common,
          supervisor: { name: 'Supervisor', directSupervisionMinutesPerWeek: 90 },
        },
      ],
      DEFAULT_POLICY,
    );

    expect(topLevel?.feasible).toBe(true);
    expect(nested?.feasible).toBe(true);
  });

  it('accepts structured supervision duration objects', () => {
    const common = {
      title: 'Data Intern',
      category: 'data_analytics',
      expectedDeliverable: 'A tested dashboard',
      learningOutcomes: ['Define metrics'],
      workMode: 'hybrid',
      supervisor: { name: 'Supervisor' },
      maximumInterns: 1,
      resourcesReady: true,
      onboardingReady: true,
    };

    const [valueUnit] = evaluateV3Positions(
      [{ ...common, directSupervision: { value: 1.5, unit: 'hours/week' } }],
      DEFAULT_POLICY,
    );
    const [minutesPeriod] = evaluateV3Positions(
      [{ ...common, directSupervision: { minutes: 90, period: 'week' } }],
      DEFAULT_POLICY,
    );

    expect(valueUnit?.canonical.weeklySupervisionMinutes).toBe(90);
    expect(minutesPeriod?.canonical.weeklySupervisionMinutes).toBe(90);
    expect(valueUnit?.feasible).toBe(true);
    expect(minutesPeriod?.feasible).toBe(true);
  });

  it('falls back to a positional id only when the document gave none', () => {
    const [withId, withoutId] = evaluateV3Positions(
      [{ id: 'role-a', title: 'A' }, { title: 'B' }],
      DEFAULT_POLICY,
    );

    expect(withId?.id).toBe('role-a');
    expect(withoutId?.id).toBe('position-2');
  });
});
