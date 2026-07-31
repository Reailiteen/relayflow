import { z } from 'zod';

/**
 * Keyset pagination, not offset.
 *
 * Offset pagination re-scans rows and skips or duplicates records when the
 * underlying set changes mid-scroll — which it always does in a live list.
 */
export const pageRequest = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  /** Opaque cursor: the sort key of the last row the client already has. */
  cursor: z.string().nullish(),
});

export type PageRequest = z.infer<typeof pageRequest>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export function toPage<T>(rows: readonly T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  // Repositories fetch limit + 1 to learn whether another page exists without
  // paying for a second count query.
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? cursorOf(last) : null,
  };
}
