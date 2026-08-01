'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@relayflow/ui-web';

/**
 * A handful of links, inline. A candidate portal with a rail would be a portal
 * pretending to be bigger than it is. Same selected-state colours as the rail
 * in the other portals, so "where am I" reads identically everywhere.
 *
 * Offers sits between interviews and documents because that is the order it
 * happens in, and it is always present rather than appearing only in
 * candidate-choice cycles — a link that comes and goes is harder to trust than
 * one that is sometimes empty.
 */
const links = (cycleId: string) => [
  { href: `/candidate/cycles/${cycleId}/selection`, label: 'Journey' },
  { href: '/candidate/interviews', label: 'Interviews' },
  { href: '/candidate/offers', label: 'Offers' },
  { href: `/candidate/cycles/${cycleId}/placements`, label: 'Ready to Start' },
] as const;

export function CandidateNav({ cycleId }: { cycleId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="ml-2 flex min-w-0 items-center gap-1 sm:ml-6">
      {links(cycleId).map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-2 text-label transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              active
                ? 'bg-brand-soft font-semibold text-brand'
                : 'font-medium text-ink-2 hover:bg-surface-hover hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
