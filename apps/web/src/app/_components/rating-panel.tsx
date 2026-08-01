"use client";

import { useState } from "react";
import {
  RATING_KEYS,
  RATING_LABELS,
  RATING_MAXIMUM,
  type CycleId,
  type RatingKey,
  type Startup,
  type StartupRating,
} from "@relayflow/entities";
import {
  Badge,
  Button,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  TextAreaField,
} from "@relayflow/ui-web";
import {
  draftStartupRatingAction,
  submitStartupRatingAction,
} from "@/server/actions";
import { usePanelAction, Feedback } from "./panel-action";

/**
 * Where ninety of a startup's hundred points come from.
 *
 * Six judgements, each needing a reason. The reason is not paperwork: an
 * allocation is a funding decision between a public programme and private
 * companies, and "why did they get 60 when we got 20" is a question that gets
 * asked out loud. A score nobody explained cannot answer it.
 *
 * The panel deliberately shows no running total. The weighting is policy and
 * lives in one place — restating it here would put a second copy of the formula
 * in a React component, and the two would drift.
 */

/**
 * Neutral scale labels, not rubric anchors.
 *
 * The real anchors are exactly the thing QSTP still has to confirm, so inventing
 * descriptive text for each dimension here would quietly turn a placeholder into
 * policy. These say what the numbers mean ordinally and nothing more.
 */
const SCALE: readonly { value: number; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Limited" },
  { value: 2, label: "Adequate" },
  { value: 3, label: "Strong" },
  { value: 4, label: "Exceptional" },
];

type Entry = { value: number | null; rationale: string };

function initialEntries(rating: StartupRating | undefined): Record<RatingKey, Entry> {
  const entries = {} as Record<RatingKey, Entry>;
  for (const key of RATING_KEYS) {
    const item = rating?.items.find((row) => row.dimension === key);
    entries[key] = { value: item?.value ?? null, rationale: item?.rationale ?? "" };
  }
  return entries;
}

export function RatingPanel({
  cycleId,
  startup,
  rating,
  canRate,
}: {
  cycleId: CycleId;
  startup: Startup;
  rating: StartupRating | undefined;
  canRate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(() => initialEntries(rating));
  const [revisionReason, setRevisionReason] = useState("");
  const action = usePanelAction();

  const set = (key: RatingKey, patch: Partial<Entry>) =>
    setEntries((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const complete = RATING_KEYS.filter(
    (key) => entries[key].value !== null && entries[key].rationale.trim().length > 0,
  );
  const replacing = rating?.status === "submitted";
  const canSubmit =
    complete.length === RATING_KEYS.length && (!replacing || revisionReason.trim().length > 0);

  const items = () =>
    RATING_KEYS.map((key) => ({
      dimension: key,
      value: entries[key].value,
      rationale: entries[key].rationale.trim() || null,
      citations: [],
    }));

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        size="xs"
        variant={rating?.status === "submitted" ? "ghost" : "secondary"}
        disabled={!canRate}
        onClick={() => setOpen(true)}
      >
        {rating?.status === "submitted"
          ? "Rated"
          : rating
            ? `Draft ${complete.length}/6`
            : "Rate"}
      </Button>
      <SidePanelContent
        title={`Rate ${startup.name}`}
        description="Six judgements, each with a reason. They carry 90 of the 100 points."
        width="lg"
      >
        <SidePanelBody className="space-y-5">
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-2">
            The 0–4 scale is provisional and awaiting QSTP confirmation, as are the
            weights behind it. Everything here produces a draft a person reviews —
            nothing is published by rating it.
          </div>

          {RATING_KEYS.map((key) => (
            <div key={key} className="space-y-2 border-t border-hairline pt-4 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-xs font-medium text-ink">{RATING_LABELS[key]}</label>
                {entries[key].value === null ? (
                  <span className="text-[11px] text-ink-3">not rated</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={RATING_LABELS[key]}>
                {SCALE.map((step) => (
                  <button
                    key={step.value}
                    type="button"
                    aria-pressed={entries[key].value === step.value}
                    onClick={() => set(key, { value: step.value })}
                    className={
                      entries[key].value === step.value
                        ? "rounded-control border border-transparent bg-[var(--rf-accent)] px-2.5 py-1 text-[11px] text-white"
                        : "rounded-control border border-hairline px-2.5 py-1 text-[11px] text-ink-2 hover:bg-surface-sunken"
                    }
                  >
                    {step.value} · {step.label}
                  </button>
                ))}
              </div>
              <TextAreaField
                label="Why"
                required
                rows={2}
                value={entries[key].rationale}
                onChange={(event) => set(key, { rationale: event.target.value })}
                hint={
                  entries[key].value !== null && !entries[key].rationale.trim()
                    ? "A rating without a reason cannot be reviewed."
                    : undefined
                }
              />
            </div>
          ))}

          {replacing ? (
            <TextAreaField
              label="Reason for changing a submitted rating"
              required
              rows={2}
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
              hint="The previous rating is kept, not overwritten — it may already have informed a decision."
            />
          ) : null}

          <div className="flex items-center gap-2 text-xs text-ink-2">
            <Badge>{complete.length} of {RATING_KEYS.length} complete</Badge>
            {complete.length < RATING_KEYS.length ? (
              <span>
                All {RATING_MAXIMUM > 0 ? RATING_KEYS.length : 0} are needed to submit — a
                startup rated on four dimensions would score lower than one rated on six
                for reasons that have nothing to do with the startup.
              </span>
            ) : null}
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <Button
            variant="secondary"
            disabled={action.pending}
            onClick={() =>
              action.run(() =>
                draftStartupRatingAction({
                  cycleId,
                  startupId: startup.id,
                  items: items(),
                }),
              )
            }
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            disabled={action.pending || !canSubmit}
            onClick={() =>
              action.run(() =>
                submitStartupRatingAction({
                  cycleId,
                  startupId: startup.id,
                  items: items(),
                  revisionReason: replacing ? revisionReason.trim() : null,
                }),
              )
            }
          >
            {replacing ? "Replace rating" : "Submit rating"}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
