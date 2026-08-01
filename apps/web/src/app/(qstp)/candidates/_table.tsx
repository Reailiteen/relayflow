import { CANDIDATE_PIPELINE_LABELS } from '@relayflow/entities';
import type { CandidateRow } from '@relayflow/logic';
import { Badge } from '@relayflow/ui-web';

/**
 * The list view: one candidate per line.
 *
 * The line that matters is the last one. A candidate in no pool is somebody
 * nobody is looking at, so it is called out in accent rather than listed as an
 * empty set — it is the only row state on this screen that implies work.
 */

const AVAILABILITY = {
  available: { tone: 'positive', label: 'available' },
  unconfirmed: { tone: 'warning', label: 'not confirmed' },
  employed: { tone: 'critical', label: 'employed' },
  not_interested: { tone: 'critical', label: 'not interested' },
  temporarily_unavailable: { tone: 'critical', label: 'unavailable' },
  placed: { tone: 'neutral', label: 'placed' },
} as const;

export function CandidateTable({ rows }: { rows: readonly CandidateRow[] }) {
  return (
    <>
      {rows.map((row) => {
        const availability = AVAILABILITY[row.candidate.availability];
        return (
          <div
            key={row.candidate.id}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{row.candidate.fullName}</span>
                <Badge tone={availability.tone}>{availability.label}</Badge>
                <span className="text-sm text-text-muted">
                  {CANDIDATE_PIPELINE_LABELS[row.stage]}
                </span>
                {row.heldBy && <Badge tone="info">held by {row.heldBy}</Badge>}
                <span className="text-xs text-text-muted">via {row.candidate.source}</span>
              </div>

              <p className="mt-0.5 truncate text-sm text-text-muted">
                {row.candidate.email}
                {row.candidate.skills.length > 0 && ` · ${row.candidate.skills.join(' · ')}`}
              </p>

              <p className="mt-0.5 text-xs text-text-muted">
                {row.pools.length === 0 ? (
                  <span className="text-accent">Not shared with any position yet</span>
                ) : (
                  row.pools
                    .map((pool) => `${pool.positionTitle} · ${pool.startupName}`)
                    .join('  |  ')
                )}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}
