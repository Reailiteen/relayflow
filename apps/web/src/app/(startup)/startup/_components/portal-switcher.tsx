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
        'flex items-center gap-0.5 rounded-md bg-surface-sunken p-0.5',
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
            'rounded-sm px-1.5 py-0.5 text-2xs font-medium text-text-muted transition-colors',
            'hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {persona.label}
        </button>
      ))}
    </div>
  );
}
