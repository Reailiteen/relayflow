"use client";

import { useState, useTransition } from "react";

/**
 * The shared plumbing every side panel needs: run a Server Action, show whether
 * it worked, and close on success.
 *
 * Extracted so the rating and intent panels do not each grow their own slightly
 * different version of "did that save?".
 */

export type ActionResult = { ok: boolean; message?: string };

export function Feedback({
  value,
}: {
  value: { text: string; error: boolean } | null;
}) {
  if (!value) return null;
  return (
    <p
      role="status"
      className={`text-xs ${value.error ? "text-critical-text" : "text-positive-text"}`}
    >
      {value.text}
    </p>
  );
}

export function usePanelAction(close?: () => void) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const run = (action: () => Promise<ActionResult>) => {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback({
        text: result.ok
          ? "Saved."
          : (result.message ?? "Could not complete this action."),
        error: !result.ok,
      });
      if (result.ok) close?.();
    });
  };
  return { pending, feedback, run, clear: () => setFeedback(null) };
}
