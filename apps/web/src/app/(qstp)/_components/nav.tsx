'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@relayflow/ui-web';

/**
 * Top-level navigation.
 *
 * Horizontal rather than a sidebar: at this density a 200px sidebar costs a
 * whole table column, and QSTP's eleven sections fit comfortably along the top.
 * Sections not yet built are rendered as disabled rather than hidden, so the
 * shape of the product is visible while it is being assembled.
 */

const SECTIONS = [
  { href: '/', label: 'Dashboard', ready: true },
  { href: '/startups', label: 'Startups', ready: true },
  { href: '/allocation', label: 'Allocation', ready: true },
  { href: '/positions', label: 'Positions', ready: true },
  { href: '/candidates', label: 'Candidates', ready: true },
  { href: '/selection', label: 'Selection', ready: true },
  { href: '/exceptions', label: 'Exceptions', ready: true },
  { href: '/redistribution', label: 'Redistribution', ready: true },
  { href: '/documents', label: 'Documents', ready: true },
] as const;

export function QstpNav() {
  const pathname = usePathname();

  return (
    <nav className="-mb-px hidden min-w-0 items-center gap-0.5 overflow-x-auto md:flex">
      {SECTIONS.map((section) => {
        const active = pathname === section.href;

        if (!section.ready) {
          return (
            <span
              key={section.href}
              className="cursor-not-allowed rounded-md px-2 py-1 text-sm text-text-muted/50"
              title="Not built yet"
            >
              {section.label}
            </span>
          );
        }

        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-2 py-1 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-surface-hover font-medium text-text'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
