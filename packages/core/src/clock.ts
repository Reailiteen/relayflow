/**
 * Time is injected, never read ambiently.
 *
 * Scheduling logic that calls `Date.now()` inline cannot be tested for the
 * cases that actually break it — DST shifts, expiries, race windows. Use-cases
 * take a Clock; tests pass a fixed one.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(iso: string): Clock {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`fixedClock received an invalid timestamp: ${iso}`);
  }
  return { now: () => new Date(instant) };
}
