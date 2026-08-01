import { BOARD_FLAG_LABELS, STARTUP_CYCLE_STAGE_LABELS, type BoardFlag } from '@relayflow/entities';
import type { StartupSummary } from '@relayflow/logic';
import { Badge, Row } from '@relayflow/ui-web';

/**
 * The list view: one startup per line, worst first.
 *
 * The ordering is the design — problems, then silence, then size. A list sorted
 * alphabetically buries the two companies that actually need chasing behind
 * four that are fine.
 *
 * It shows the same stage the board groups by, as a word rather than a column,
 * so switching views is a change of shape and never a change of story.
 */

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const FLAG_TONE: Record<BoardFlag, 'neutral' | 'info' | 'positive' | 'warning' | 'critical'> = {
  overdue: 'critical',
  exception_requested: 'info',
  waitlisted: 'neutral',
  hours_at_risk: 'critical',
  missing_documents: 'warning',
  needs_qstp_action: 'warning',
};

export function StartupTable({ rows }: { rows: readonly StartupSummary[] }) {
  return (
    <>
      {rows.map((summary) => (
        <Row
          key={summary.startup.id}
          tone={
            summary.overdue
              ? 'critical'
              : summary.silent
                ? 'warning'
                : summary.allocatedHours === 0
                  ? 'neutral'
                  : 'positive'
          }
          kind={summary.allocatedHours === 0 ? 'Waitlisted' : `${summary.allocatedHours}h/week`}
          subject={
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{summary.startup.name}</span>
              <span className="text-sm text-text-muted">
                {STARTUP_CYCLE_STAGE_LABELS[summary.stage]}
              </span>
              {summary.flags.map((flag) => (
                <Badge key={flag} tone={FLAG_TONE[flag]}>
                  {BOARD_FLAG_LABELS[flag]}
                </Badge>
              ))}
            </span>
          }
          detail={
            <span className="hidden sm:inline">
              {summary.positionCount} role{summary.positionCount === 1 ? '' : 's'} ·{' '}
              {summary.selectionCount} selected · due {date(summary.selectionDeadline)}
            </span>
          }
          href="/allocation"
        />
      ))}
    </>
  );
}
