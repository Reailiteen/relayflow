import { POSITION_REVIEW_LABELS, totalWeeklyHours } from '@relayflow/entities';
import type { PositionRow } from '@relayflow/logic';
import { Badge } from '@relayflow/ui-web';
import { ReviewActions } from './_review';

/**
 * The list view: one role per line.
 *
 * It shows the same stage the board groups by, as a word rather than a column,
 * so switching views is a change of shape and never a change of story. The
 * hours arithmetic is spelled out — `2 × 20h = 40h/week` — because a reviewer
 * approving a role is really approving that number.
 */
export function PositionTable({
  rows,
  canReview,
}: {
  rows: readonly PositionRow[];
  canReview: boolean;
}) {
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.position.id}
          className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-3 py-2 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{row.position.title}</span>
              {row.stage && (
                <Badge
                  tone={
                    row.stage === 'approved' || row.stage === 'filled'
                      ? 'positive'
                      : row.stage === 'submitted'
                        ? 'info'
                        : 'warning'
                  }
                >
                  {POSITION_REVIEW_LABELS[row.stage]}
                </Badge>
              )}
              {row.facts.exceedsAllocation && <Badge tone="critical">over allocation</Badge>}
              <span className="text-sm text-text-muted">
                {row.startup?.name ?? 'Unknown startup'}
              </span>
            </div>

            <p className="mt-0.5 text-sm text-text-muted">
              {row.position.internCount} × {row.position.hoursPerIntern}h ={' '}
              <span className="font-medium text-text-secondary">
                {totalWeeklyHours(row.position)}h/week
              </span>{' '}
              · {row.position.durationWeeks} weeks
              {row.position.supervisorName && ` · ${row.position.supervisorName}`}
            </p>

            <p className="mt-0.5 text-xs text-text-muted">
              {row.poolSize} in pool · {row.selectionCount} selected
            </p>

            {row.position.reviewNote && (
              <p className="mt-1 text-sm text-warning-text">Sent back: {row.position.reviewNote}</p>
            )}
          </div>

          {canReview && (row.stage === 'submitted' || row.stage === 'changes_requested') && (
            <ReviewActions positionId={row.position.id} title={row.position.title} />
          )}
        </div>
      ))}
    </>
  );
}
