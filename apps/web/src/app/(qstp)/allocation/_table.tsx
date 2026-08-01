'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { HOUR_TIERS, type HourTier } from '@relayflow/entities';
import type { AllocationRow } from '@relayflow/logic';
import { Badge, cn } from '@relayflow/ui-web';
import { decideAllocationAction } from '@/server/actions';
import { OverrideDialog } from './_override-dialog';

/**
 * The allocation table.
 *
 * Tiers are a segmented control rather than a dropdown: there are only five,
 * and seeing all of them at once is what lets you compare rows down the column.
 * A tier that would overrun the remaining budget is disabled rather than hidden,
 * so the constraint is visible instead of mysterious.
 */
export function AllocationTable({
  rows,
  remaining,
  editable,
}: {
  rows: readonly AllocationRow[];
  remaining: number;
  editable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Set when a chosen tier departs from the recommendation and needs a reason. */
  const [override, setOverride] = useState<{ row: AllocationRow; tier: HourTier } | null>(null);

  const submit = (row: AllocationRow, tier: HourTier, overrideReason: string | null) => {
    setError(null);
    setBusyId(row.startup.id);

    startTransition(async () => {
      const result = await decideAllocationAction({
        startupId: row.startup.id,
        weeklyHours: tier,
        score: row.score,
        justification: row.allocation?.justification ?? null,
        overrideReason,
      });
      if (!result.ok) setError(result.message);
      setBusyId(null);
    });
  };

  const assign = (row: AllocationRow, tier: HourTier) => {
    // Departing from the scored recommendation needs a written reason, and the
    // use-case rejects one without it. Asking first keeps that rule from
    // surfacing as an unexplained failure.
    if (row.recommended !== null && row.recommended !== tier) {
      setOverride({ row, tier });
      return;
    }
    submit(row, tier, null);
  };

  return (
    <div className="overflow-x-auto">
      {error && (
        <p className="border-b border-critical/20 bg-critical-subtle px-3 py-1.5 text-sm text-critical-text">
          {error}
        </p>
      )}

      <table className="w-full min-w-[820px] border-collapse">
        <thead>
          <tr className="border-b border-border text-2xs uppercase tracking-wider text-text-muted">
            <th className="px-3 py-1.5 text-left font-medium">Startup</th>
            <th className="w-14 px-2 py-1.5 text-right font-medium">Score</th>
            <th className="w-16 px-2 py-1.5 text-right font-medium">Rec.</th>
            <th className="w-[248px] px-2 py-1.5 text-left font-medium">Weekly hours</th>
            <th className="w-24 px-2 py-1.5 text-right font-medium">Positions</th>
            <th className="w-20 px-3 py-1.5 text-right font-medium">Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const current = row.allocation?.weeklyHours ?? null;
            const busy = busyId === row.startup.id && pending;

            return (
              <tr
                key={row.startup.id}
                className={cn(
                  'border-b border-border last:border-b-0 hover:bg-surface-hover',
                  busy && 'opacity-50',
                )}
              >
                <td className="max-w-0 px-3 py-1.5">
                  <div className="truncate font-medium text-text">{row.startup.name}</div>
                  <div className="truncate text-xs text-text-muted">
                    {row.startup.sector ?? 'No sector'}
                  </div>
                </td>

                <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                  {row.score ?? '—'}
                </td>

                <td className="px-2 py-1.5 text-right tabular-nums text-text-muted">
                  {row.recommended ?? '—'}
                </td>

                <td className="px-2 py-1.5">
                  <div className="flex gap-0.5" role="group" aria-label="Weekly hours">
                    {HOUR_TIERS.map((tier) => {
                      const selected = current === tier;
                      // Room left if we moved this startup to `tier`.
                      const affordable = tier - (current ?? 0) <= remaining;

                      return (
                        <button
                          key={tier}
                          type="button"
                          disabled={!editable || busy || (!affordable && !selected)}
                          onClick={() => assign(row, tier)}
                          aria-pressed={selected}
                          title={
                            !affordable && !selected
                              ? `Only ${remaining} hours remain unallocated`
                              : undefined
                          }
                          className={cn(
                            'h-6 w-11 rounded-sm text-xs font-medium tabular-nums transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'bg-accent text-accent-text'
                              : 'bg-surface-sunken text-text-secondary hover:bg-surface-hover hover:text-text',
                            'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-surface-sunken',
                          )}
                        >
                          {tier}
                        </button>
                      );
                    })}
                  </div>
                </td>

                <td className="px-2 py-1.5 text-right text-sm tabular-nums text-text-secondary">
                  {row.positionCount > 0 ? (
                    <span title={`${row.positionHours}h across ${row.positionCount} roles`}>
                      {row.positionCount} · {row.positionHours}h
                    </span>
                  ) : current && current > 0 ? (
                    <span className="text-warning-text">none</span>
                  ) : (
                    '—'
                  )}
                </td>

                <td className="px-3 py-1.5 text-right">
                  {row.isOverride ? (
                    <Badge tone="warning">
                      <AlertTriangle className="size-2.5" />
                      override
                    </Badge>
                  ) : row.allocation?.status === 'confirmed' ? (
                    <Badge tone="positive">
                      <Check className="size-2.5" />
                      set
                    </Badge>
                  ) : (
                    <Badge>draft</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!editable && (
        <p className="border-t border-border px-3 py-1.5 text-xs text-text-muted">
          You have read-only access. Allocation changes require an operations or programme-manager
          role.
        </p>
      )}

      {override && override.row.recommended !== null && (
        <OverrideDialog
          open
          onOpenChange={(next) => !next && setOverride(null)}
          startupName={override.row.startup.name}
          recommended={override.row.recommended}
          chosen={override.tier}
          onConfirm={(reason) => {
            submit(override.row, override.tier, reason);
            setOverride(null);
          }}
        />
      )}
    </div>
  );
}

export type { AllocationRow };
