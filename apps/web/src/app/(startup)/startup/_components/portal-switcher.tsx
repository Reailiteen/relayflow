'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@relayflow/ui-web';

/**
 * Dev-only: hop between the seeded personas without signing out.
 *
 * Acme is the happy path — allocated, submitted, interviewed, placed someone.
 * Northwind missed the selection deadline and has an extension pending, so the
 * two show materially different next actions. Disappears with the fixtures.
 */
const PERSONAS = [
  { key: 'startupOwner', label: 'Acme' },
  { key: 'lateStartup', label: 'Northwind' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'manager', label: 'QSTP' },
] as const;

export function PortalSwitcher() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = (key: string) => {
    document.cookie = `relayflow_dev_actor=${key}; path=/; max-age=86400`;
    startTransition(() => {
      // QSTP staff have no startup portal, so send them to their own.
      if (key === 'manager') router.push('/');
      else router.refresh();
    });
  };

  return (
    <div
      className={cn(
        'hidden h-9 items-center gap-0.5 rounded-control border border-hairline-strong',
        'bg-panel p-1 shadow-control transition-opacity sm:flex',
        pending && 'opacity-60',
      )}
      title="Development only — switch acting user"
    >
      {PERSONAS.map((persona) => (
        <button
          key={persona.key}
          type="button"
          onClick={() => switchTo(persona.key)}
          className={cn(
            'rounded-[5px] px-2 py-1 text-2xs font-medium text-ink-3 transition-colors',
            'hover:bg-surface-hover hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {persona.label}
        </button>
      ))}
    </div>
  );
}
