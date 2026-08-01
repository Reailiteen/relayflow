/**
 * How the interface says dates, times and enum values.
 *
 * These exist because the alternative keeps happening: an ISO string or a
 * database enum reaches a screen unformatted, and `2026-02-01` or
 * `changes_requested` ships to a programme manager. Doing it in one place also
 * pins the locale and the time zone, so a deadline does not move by a day
 * depending on where the reader is sitting.
 *
 * Qatar time, because the programme's deadlines are Qatar deadlines.
 */

const ZONE = 'Asia/Qatar';
const LOCALE = 'en-GB';

const DAY = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: ZONE,
});

const DAY_NO_YEAR = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: ZONE,
});

const STAMP = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZONE,
});

/** A calendar date: "1 Feb 2026". */
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}

/** A moment: "1 Feb, 09:00". Used where the ordering within a day matters. */
export function formatStamp(iso: string): string {
  return STAMP.format(new Date(iso));
}

/**
 * A span: "1 Feb – 31 Aug 2026".
 *
 * The year is stated once when both ends share it — repeating it is noise in a
 * table where every row is the same programme year.
 */
export function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${sameYear ? DAY_NO_YEAR.format(start) : DAY.format(start)} – ${DAY.format(end)}`;
}

/**
 * A stored enum, as a person reads it: `changes_requested` → "Changes
 * requested". Only the first word is capitalised — these are labels in a
 * sentence, not headings.
 */
export function humanise(value: string): string {
  const words = value.replaceAll('_', ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A last resort for an entity with no name to show.
 *
 * Never the primary label for a row: a UUID prefix tells a reader nothing about
 * which startup or candidate they are looking at. It is here for the cases
 * where the identifier genuinely is the subject — an audit line item.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
