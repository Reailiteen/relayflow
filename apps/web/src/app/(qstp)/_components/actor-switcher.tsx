'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import type { QstpRole } from '@relayflow/access';
import { cn } from '@relayflow/ui-web';

/**
 * Dev-only: re-run the page as a different seeded user.
 *
 * This is here because "does the UI actually respect capabilities?" is a
 * question you have to be able to answer in two seconds, not by editing a
 * cookie by hand. It disappears with the fixtures.
 *
 * A native select rather than a segmented control: five personas across the top
 * bar crowded out the account block, and a select collapses them to the one
 * that matters — the role currently in force.
 */

const ACTORS = [
  { key: 'manager', label: 'Manager' },
  { key: 'operations', label: 'Operations' },
  { key: 'auditor', label: 'Auditor' },
  { key: 'startupOwner', label: 'Startup' },
  { key: 'candidate', label: 'Candidate' },
] as const;

/** The seeded persona each QSTP role came from, so the select shows it selected. */
const PERSONA_FOR_ROLE: Record<QstpRole, string> = {
  program_manager: 'manager',
  operations: 'operations',
  viewer: 'auditor',
};

export function ActorSwitcher({ current }: { current: QstpRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (key: string) => {
    document.cookie = `relayflow_dev_actor=${key}; path=/; max-age=86400`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      className={cn(
        'grid h-9 items-center rounded-control border border-hairline-strong bg-panel',
        'shadow-control transition-opacity focus-within:ring-2 focus-within:ring-brand',
        pending && 'opacity-60',
      )}
      title="Development only — switch acting user"
    >
      <select
        aria-label="Acting role"
        value={PERSONA_FOR_ROLE[current]}
        onChange={(event) => switchTo(event.target.value)}
        className={cn(
          'col-start-1 row-start-1 h-full w-[124px] appearance-none bg-transparent',
          'pr-8 pl-3.5 text-body font-medium text-ink-2 outline-none',
        )}
      >
        {ACTORS.map((actor) => (
          <option key={actor.key} value={actor.key}>
            {actor.label}
          </option>
        ))}
      </select>

      <ChevronDown
        className="pointer-events-none col-start-1 row-start-1 mr-3 size-4 justify-self-end text-ink-3"
        aria-hidden="true"
      />
    </div>
  );
}
