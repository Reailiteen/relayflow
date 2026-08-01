"use client";

import { useMemo, useState } from "react";
import {
  INTENT_CHECK_LABELS,
  checkIntentFeasibility,
  type CycleId,
  type PositionIntent,
  type StartupId,
} from "@relayflow/entities";
import {
  Button,
  SelectField,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  TextAreaField,
  TextField,
} from "@relayflow/ui-web";
import { submitPositionIntentAction } from "@/server/actions";
import { Feedback, usePanelAction } from "./panel-action";

/**
 * "Could you host an intern?" — asked before hours are allocated.
 *
 * Ten fields, all required, because the prioritisation engine gates on them and
 * a blank is not a "no". A startup that fails this is `not_ready`, which is a
 * different outcome from scoring badly, and it is the one thing here that can
 * be fixed by the startup itself.
 *
 * The gate runs live in this form rather than only on the server. Telling
 * someone their role will be rejected while they can still change it is worth
 * more than telling QSTP afterwards.
 */

const EMPTY = {
  title: "",
  category: "",
  expectedDeliverable: "",
  learningOutcomes: "",
  workMode: "hybrid" as PositionIntent["workMode"],
  supervisorName: "",
  weeklySupervisionMinutes: "60",
  maximumInterns: "1",
  resourcesReady: false,
  onboardingReady: false,
};

function fromIntent(intent: PositionIntent | undefined) {
  if (!intent) return EMPTY;
  return {
    title: intent.title,
    category: intent.category,
    expectedDeliverable: intent.expectedDeliverable,
    learningOutcomes: intent.learningOutcomes.join("\n"),
    workMode: intent.workMode,
    supervisorName: intent.supervisorName,
    weeklySupervisionMinutes: String(intent.weeklySupervisionMinutes),
    maximumInterns: String(intent.maximumInterns),
    resourcesReady: intent.resourcesReady,
    onboardingReady: intent.onboardingReady,
  };
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-hairline px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-3.5 accent-[var(--rf-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="block text-[11px] leading-4 text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

export function PositionIntentPanel({
  cycleId,
  startupId,
  intent,
  canSubmit,
}: {
  cycleId: CycleId;
  startupId: StartupId;
  intent: PositionIntent | undefined;
  canSubmit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => fromIntent(intent));
  const action = usePanelAction();

  const outcomes = form.learningOutcomes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // The same function the engine calls, running on the same values, as they
  // are typed. No second copy of the rules.
  const gate = useMemo(
    () =>
      checkIntentFeasibility({
        title: form.title,
        category: form.category,
        expectedDeliverable: form.expectedDeliverable,
        learningOutcomes: outcomes,
        workMode: form.workMode,
        supervisorName: form.supervisorName,
        weeklySupervisionMinutes: Number(form.weeklySupervisionMinutes) || 0,
        maximumInterns: Number(form.maximumInterns) || 0,
        resourcesReady: form.resourcesReady,
        onboardingReady: form.onboardingReady,
      }),
    [form, outcomes],
  );

  const unmet = gate
    ? Object.entries(gate.checks)
        .filter(([, passed]) => !passed)
        .map(([check]) => INTENT_CHECK_LABELS[check] ?? check)
    : [];

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <Button
        size="xs"
        variant={intent ? "ghost" : "secondary"}
        disabled={!canSubmit}
        onClick={() => setOpen(true)}
      >
        {intent ? "Edit readiness" : "Declare readiness"}
      </Button>
      <SidePanelContent
        title="Internship readiness"
        description="What you could host, before hours are decided."
        width="lg"
      >
        <SidePanelBody className="space-y-4">
          <div className="rounded-control bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-2">
            This is not a job posting — you will write that later, once you know
            your allocation. QSTP uses this to check the placement would be a real
            one.
          </div>

          <TextField
            label="Role title"
            required
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
          />
          <TextField
            label="Discipline"
            required
            value={form.category}
            onChange={(event) => set("category", event.target.value)}
            hint="For example: ai_engineering, data_analytics, bioinformatics."
          />
          <TextAreaField
            label="What will the intern produce?"
            required
            rows={3}
            value={form.expectedDeliverable}
            onChange={(event) => set("expectedDeliverable", event.target.value)}
            hint="Something concrete. “To be defined” does not pass review."
          />
          <TextAreaField
            label="What will they learn?"
            required
            rows={3}
            value={form.learningOutcomes}
            onChange={(event) => set("learningOutcomes", event.target.value)}
            hint="One per line."
          />
          <SelectField
            label="Work arrangement"
            value={form.workMode}
            onChange={(event) =>
              set("workMode", event.target.value as PositionIntent["workMode"])
            }
          >
            <option value="onsite">On site</option>
            <option value="hybrid">Hybrid</option>
            <option value="remote">Remote</option>
          </SelectField>
          <TextField
            label="Supervisor"
            required
            value={form.supervisorName}
            onChange={(event) => set("supervisorName", event.target.value)}
            hint="A named person, not a team."
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Supervision, minutes per week"
              required
              inputMode="numeric"
              value={form.weeklySupervisionMinutes}
              onChange={(event) => set("weeklySupervisionMinutes", event.target.value)}
              hint="At least 30."
            />
            <TextField
              label="Interns this role can take"
              required
              inputMode="numeric"
              value={form.maximumInterns}
              onChange={(event) => set("maximumInterns", event.target.value)}
            />
          </div>
          <Checkbox
            label="Resources are ready"
            hint="Desk or access, accounts, data, hardware — whatever they need on day one."
            checked={form.resourcesReady}
            onChange={(next) => set("resourcesReady", next)}
          />
          <Checkbox
            label="Onboarding is ready"
            hint="Somebody has time set aside to bring them up to speed."
            checked={form.onboardingReady}
            onChange={(next) => set("onboardingReady", next)}
          />

          {/*
            Shown as it is filled in, not on submit. An unready answer is still
            accepted — QSTP needs to see it — but the startup finds out here
            rather than through an allocation it never got.
          */}
          <div
            className={`rounded-control border px-4 py-3 text-xs leading-5 ${
              unmet.length === 0
                ? "border-positive-text/30 text-positive-text"
                : "border-hairline text-ink-2"
            }`}
          >
            {unmet.length === 0 ? (
              <p>This role meets all ten readiness checks.</p>
            ) : (
              <>
                <p className="font-medium text-ink">
                  {unmet.length} check{unmet.length === 1 ? "" : "s"} not met yet
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {unmet.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px]">
                  You can still submit. QSTP will see it as not ready rather than
                  as a low score.
                </p>
              </>
            )}
          </div>
          <Feedback value={action.feedback} />
        </SidePanelBody>
        <SidePanelFooter>
          <SidePanelClose asChild>
            <Button variant="ghost">Close</Button>
          </SidePanelClose>
          <Button
            variant="primary"
            disabled={action.pending || !form.title.trim()}
            onClick={() =>
              action.run(() =>
                submitPositionIntentAction({
                  cycleId,
                  startupId,
                  ...(intent ? { intentId: intent.id } : {}),
                  title: form.title,
                  category: form.category,
                  expectedDeliverable: form.expectedDeliverable,
                  learningOutcomes: outcomes,
                  workMode: form.workMode,
                  supervisorName: form.supervisorName,
                  weeklySupervisionMinutes: Number(form.weeklySupervisionMinutes) || 0,
                  maximumInterns: Number(form.maximumInterns) || 0,
                  resourcesReady: form.resourcesReady,
                  onboardingReady: form.onboardingReady,
                }),
              )
            }
          >
            {intent ? "Update" : "Submit"}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
