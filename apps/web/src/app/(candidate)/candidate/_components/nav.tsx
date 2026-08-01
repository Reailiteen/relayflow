'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@relayflow/ui-web';

/**
 * Three links, inline. A candidate portal with a sidebar would be a portal
 * pretending to be bigger than it is.
 */
const LINKS = [
  { href: '/candidate', label: 'Overview' },
  { href: '/candidate/interviews', label: 'Interviews' },
  { href: '/candidate/documents', label: 'Documents' },
] as const;

export function CandidateNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="flex items-center gap-0.5">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-2 py-1 text-base transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-accent-subtle font-medium text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
