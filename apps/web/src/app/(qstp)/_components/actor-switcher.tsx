'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@relayflow/ui-web';

/**
 * Dev-only: re-run the page as a different seeded user.
 *
 * This is here because "does the UI actually respect capabilities?" is a
 * question you have to be able to answer in two seconds, not by editing a
 * cookie by hand. It disappears with the fixtures.
 */

const ACTORS = [
  { key: 'manager', label: 'Manager' },
  { key: 'operations', label: 'Operations' },
  { key: 'auditor', label: 'Auditor' },
  { key: 'startupOwner', label: 'Startup' },
  { key: 'candidate', label: 'Candidate' },
] as const;

export function ActorSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (key: string) => {
    document.cookie = `relayflow_dev_actor=${key}; path=/; max-age=86400`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-md bg-surface-sunken p-0.5',
        pending && 'opacity-60',
      )}
      title="Development only — switch acting user"
    >
      {ACTORS.map((actor) => (
        <button
          key={actor.key}
          type="button"
          onClick={() => switchTo(actor.key)}
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-2xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            current === actor.key || (current === 'program_manager' && actor.key === 'manager')
              ? 'bg-surface text-text shadow-sm'
              : 'text-text-muted hover:text-text',
          )}
        >
          {actor.label}
        </button>
      ))}
    </div>
  );
}
