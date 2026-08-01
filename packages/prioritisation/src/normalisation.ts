/**
 * Turning what a document said into what the gate can check.
 *
 * Startup submissions are written by people, so a position that is perfectly
 * ready reads `"Yes"`, `"75 minutes/week"`, `"6 years"` — not `true`, `75`, `6`.
 * An earlier live run rejected seven genuinely valid roles purely because these
 * document-native forms were never canonicalised, which is why every parser here
 * accepts the shapes real submissions actually use.
 *
 * Nothing here guesses. A value that cannot be read stays `null` and fails its
 * check, because a position wrongly marked feasible costs an intern a placement.
 */

import type {
  CanonicalPosition,
  PositionChecks,
  PositionResult,
  PrioritisationPolicy,
  Extraction,
  ExtractionField,
} from './types';

const WORK_MODES = new Set(['onsite', 'hybrid', 'remote']);

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * "A deliverable has not yet been defined" is a sentence, but it is not a
 * deliverable. Placeholder prose must not pass a presence check.
 */
function meaningfulText(value: unknown): boolean {
  if (!hasText(value)) return false;
  return !/(not yet defined|has not (?:yet )?been defined|\btbd\b|not provided|^n\/?a$)/i.test(
    value.trim(),
  );
}

function listPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => meaningfulText(String(item)));
  return meaningfulText(value);
}

export function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['yes', 'true', 'ready', 'available'].includes(normalized)) return true;
  if (['no', 'false', 'not ready', 'unavailable'].includes(normalized)) return false;
  return null;
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const match = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Accepts `90`, `"90 minutes/week"`, `"1.5 hours"`, `{minutes: 90}`, `{value: 1.5, unit: 'hours/week'}`. */
export function parseWeeklyMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    if (typeof source.minutes === 'number' && Number.isFinite(source.minutes)) return source.minutes;
    if (typeof source.hours === 'number' && Number.isFinite(source.hours)) return source.hours * 60;
    const amount = parseNumber(source.value);
    if (amount === null) return null;
    const unit = typeof source.unit === 'string' ? source.unit : '';
    return /hours?|hrs?/i.test(unit) ? amount * 60 : amount;
  }
  if (typeof value !== 'string') return null;
  const amount = parseNumber(value);
  if (amount === null) return null;
  return /hours?|hrs?/i.test(value) ? amount * 60 : amount;
}

function supervisorName(position: Record<string, unknown>): string | null {
  const supervisor = position.supervisor;
  if (hasText(supervisor)) return supervisor.trim();
  const nested = asRecord(supervisor).name;
  if (hasText(nested)) return nested.trim();
  return null;
}

export function canonicalizePosition(position: unknown = {}): CanonicalPosition {
  const source = asRecord(position);
  const supervisor = asRecord(source.supervisor);

  return {
    // A submission that numbered its roles still has an identity, and inventing
    // `position-1` over the top of it would break the link back to the document
    // the reviewer is reading. Anything that is not a string or a number is not
    // an id, and is better absent than stringified into nonsense.
    id: typeof source.id === 'string' || typeof source.id === 'number' ? String(source.id) : null,
    title: hasText(source.title) ? source.title.trim() : null,
    category: hasText(source.category) ? source.category.trim().toLowerCase() : null,
    expectedDeliverable: hasText(source.expectedDeliverable)
      ? source.expectedDeliverable.trim()
      : null,
    learningOutcomes: source.learningOutcomes ?? null,
    workMode: hasText(source.workMode) ? source.workMode.trim().toLowerCase() : null,
    supervisorName: supervisorName(source),
    relevantExperienceYears: parseNumber(
      source.relevantExperienceYears ??
        source.relevantExperience ??
        supervisor.relevantExperienceYears ??
        supervisor.relevantExperience ??
        supervisor.relevantYears,
    ),
    weeklySupervisionMinutes: parseWeeklyMinutes(
      source.weeklySupervisionMinutes ??
        source.directSupervisionMinutes ??
        source.directSupervisionMinutesPerWeek ??
        source.directSupervision ??
        supervisor.weeklyMinutes ??
        supervisor.directSupervisionMinutesPerWeek,
    ),
    maximumInterns: parseNumber(source.maximumInterns ?? source.maxInterns ?? supervisor.maxInterns),
    resourcesReady: parseBoolean(source.resourcesReady),
    onboardingReady: parseBoolean(source.onboardingReady),
  };
}

/**
 * The feasibility gate. All ten checks must pass.
 *
 * This is not a scoring input — it is a yes/no on whether the startup can host
 * an intern at all. A startup that fails it is `not_ready`, which is a different
 * thing from scoring badly, and the two must never be collapsed.
 */
export function evaluateV3Positions(
  positions: unknown,
  policy: PrioritisationPolicy,
): PositionResult[] {
  if (!Array.isArray(positions)) return [];

  return positions.map((position, index): PositionResult => {
    const canonical = canonicalizePosition(position);
    const checks: PositionChecks = {
      title: hasText(canonical.title),
      category: hasText(canonical.category),
      expectedDeliverable: meaningfulText(canonical.expectedDeliverable),
      learningOutcomes: listPresent(canonical.learningOutcomes),
      workMode: canonical.workMode !== null && WORK_MODES.has(canonical.workMode),
      supervisor: hasText(canonical.supervisorName),
      supervisorCapacity: canonical.maximumInterns !== null && canonical.maximumInterns >= 1,
      supervisionCommitment:
        canonical.weeklySupervisionMinutes !== null &&
        canonical.weeklySupervisionMinutes >= policy.minimumWeeklySupervisionMinutes,
      resourcesReady: canonical.resourcesReady === true,
      onboardingReady: canonical.onboardingReady === true,
    };

    return {
      index,
      id: canonical.id ?? `position-${index + 1}`,
      title: canonical.title,
      feasible: Object.values(checks).every(Boolean),
      checks,
      canonical,
    };
  });
}

export function fieldsByPath(
  extraction: Extraction | null | undefined,
): Record<string, ExtractionField> {
  return Object.fromEntries((extraction?.fields ?? []).map((field) => [field.fieldPath, field]));
}
