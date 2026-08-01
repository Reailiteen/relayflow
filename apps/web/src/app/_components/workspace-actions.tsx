'use client';

import { useState, useTransition } from 'react';
import type { CycleId, CycleStage, PlacementId, PositionId, PrioritizationRunId, RecoveryCaseId } from '@relayflow/entities';
import { Button } from '@relayflow/ui-web';
import {
  acknowledgeAllocationAction,
  advanceCycleStageAction,
  confirmRecoveryAction,
  finalizePlacementAction,
  publishAllocationsAction,
  runPrioritizationAction,
  setPlacementReadinessAction,
  transitionPositionAction,
} from '@/server/actions';

type ResultLike = { ok: boolean; message?: string };

function ActionButton({
  children,
  run,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  run: () => Promise<ResultLike>;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await run();
            setMessage(result.ok ? 'Saved.' : (result.message ?? 'Could not complete this action.'));
          })
        }
      >
        {pending ? 'Working…' : children}
      </Button>
      {message ? (
        <span className={`text-[11px] ${message === 'Saved.' ? 'text-positive-text' : 'text-critical-text'}`} role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Publishing an incomplete draft leaves every unevaluated startup with nothing,
 * so it cannot be one click. The reason is required by the use-case too — this
 * is the UI catching up with a rule the server already enforces.
 */
function PublishAllocations({
  cycleId,
  draftRunId,
  unevaluatedCount,
}: {
  cycleId: CycleId;
  draftRunId: PrioritizationRunId;
  unevaluatedCount: number;
}) {
  const [reason, setReason] = useState('');
  const incomplete = unevaluatedCount > 0;

  if (!incomplete) {
    return (
      <ActionButton run={() => publishAllocationsAction({ cycleId, runId: draftRunId })} variant="primary">
        Publish allocations
      </ActionButton>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-[11px] text-critical-text">
        {unevaluatedCount} startup{unevaluatedCount === 1 ? ' has' : 's have'} not been
        evaluated. Publishing now leaves {unevaluatedCount === 1 ? 'it' : 'them'} with no
        allocation.
      </p>
      <textarea
        className="w-72 rounded-control border border-hairline bg-surface px-3 py-2 text-xs"
        rows={2}
        value={reason}
        placeholder="Why publish without them?"
        onChange={(event) => setReason(event.target.value)}
        aria-label="Reason for publishing an incomplete draft"
      />
      <ActionButton
        variant="danger"
        run={() =>
          publishAllocationsAction({
            cycleId,
            runId: draftRunId,
            acknowledgeIncomplete: true,
            incompleteReason: reason,
          })
        }
      >
        Publish without them
      </ActionButton>
    </div>
  );
}

export function AllocationActions({
  cycleId,
  mode,
  acknowledged,
  draftRunId,
  unevaluatedCount = 0,
}: {
  cycleId: CycleId;
  mode: 'qstp' | 'startup';
  acknowledged: boolean;
  draftRunId: PrioritizationRunId | undefined;
  unevaluatedCount?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {mode === 'qstp' ? (
        <ActionButton run={() => runPrioritizationAction({ cycleId })} variant={draftRunId ? 'secondary' : 'primary'}>
          {draftRunId ? 'Run new draft' : 'Run prioritization'}
        </ActionButton>
      ) : null}
      {mode === 'qstp' && draftRunId ? (
        <PublishAllocations
          cycleId={cycleId}
          draftRunId={draftRunId}
          unevaluatedCount={unevaluatedCount}
        />
      ) : null}
      {mode === 'startup' && !acknowledged ? (
        <ActionButton run={() => acknowledgeAllocationAction({ cycleId })} variant="primary">
          Acknowledge allocation
        </ActionButton>
      ) : null}
    </div>
  );
}

export function AdvanceStageAction({ cycleId, stage, next }: { cycleId: CycleId; stage: CycleStage; next: CycleStage | null }) {
  if (!next) return null;
  return (
    <ActionButton
      run={() =>
        advanceCycleStageAction({
          cycleId,
          to: next,
          warningOverrideReason: `Manual gate review from ${stage} to ${next}.`,
        })
      }
      variant="primary"
    >
      Advance to {next.replaceAll('_', ' ')}
    </ActionButton>
  );
}

export function PositionAction({
  cycleId,
  positionId,
  to,
}: {
  cycleId: CycleId;
  positionId: PositionId;
  to: 'under_review' | 'approved' | 'locked' | 'resubmitted';
}) {
  return (
    <ActionButton
      run={() =>
        transitionPositionAction({
          cycleId,
          positionId,
          to,
          reason: to === 'resubmitted' ? 'Startup resubmitted after addressing feedback.' : null,
        })
      }
      variant={to === 'approved' || to === 'locked' ? 'primary' : 'secondary'}
    >
      {to.replaceAll('_', ' ')}
    </ActionButton>
  );
}

export function PlacementAction({
  cycleId,
  placementId,
  action,
}: {
  cycleId: CycleId;
  placementId: PlacementId;
  action: 'candidate' | 'startup' | 'details' | 'qstp' | 'ready' | 'onboard';
}) {
  return (
    <ActionButton
      run={() =>
        action === 'ready' || action === 'onboard'
          ? finalizePlacementAction({ cycleId, placementId, action })
          : setPlacementReadinessAction({ cycleId, placementId, party: action })
      }
      variant={action === 'ready' || action === 'onboard' ? 'primary' : 'secondary'}
    >
      {action === 'ready' ? 'Mark Ready to Start' : action === 'onboard' ? 'Mark onboarded' : `Confirm ${action}`}
    </ActionButton>
  );
}

export function RecoveryAction({ cycleId, recoveryCaseId }: { cycleId: CycleId; recoveryCaseId: RecoveryCaseId }) {
  return (
    <ActionButton run={() => confirmRecoveryAction({ cycleId, recoveryCaseId })} variant="primary">
      Confirm recovery
    </ActionButton>
  );
}
