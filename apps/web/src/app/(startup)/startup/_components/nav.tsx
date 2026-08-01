'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, CalendarClock, FileCheck2, Home, Users, Video } from 'lucide-react';
import { Badge, cn } from '@relayflow/ui-web';

/**
 * Startup navigation.
 *
 * Same permanent sidebar as the QSTP portal, deliberately shorter. A startup
 * visits a handful of times per cycle, so the menu is a map of the process
 * rather than a workspace — which is also why unbuilt sections are shown as
 * "soon" instead of hidden.
 */

const SECTIONS = [
  { href: '/startup', label: 'Home', icon: Home, ready: true },
  { href: '/startup/positions', label: 'Positions', icon: Briefcase, ready: true },
  { href: '/startup/candidates', label: 'Candidates', icon: Users, ready: true },
  { href: '/startup/interviews', label: 'Interviews', icon: Video, ready: true },
  { href: '/startup/exception', label: 'Deadline', icon: CalendarClock, ready: true },
  { href: '/startup/documents', label: 'Documents', icon: FileCheck2, ready: true },
] as const;

export function currentStartupSection(pathname: string): string {
  // Longest match wins, so /startup/positions/new still reads as "Positions".
  const match = [...SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((section) => pathname === section.href || pathname.startsWith(section.href + '/'));
  return match?.label ?? 'RelayFlow';
}

export function StartupSidebar({ startupName }: { startupName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-md font-semibold tracking-tight">RelayFlow</span>
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">Startup</div>
        <div className="truncate text-sm text-text">{startupName}</div>
      </div>

      <nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {SECTIONS.map((section) => {
          const active =
            pathname === section.href ||
            (section.href !== '/startup' && pathname.startsWith(section.href + '/'));
          const Icon = section.icon;

          if (!section.ready) {
            return (
              <span
                key={section.href}
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-base text-text-muted/50"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{section.label}</span>
                <Badge>soon</Badge>
              </span>
            );
          }

          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-base transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-accent-subtle font-medium text-accent'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{section.label}</span>
            </Link>
          );
        })}
      </nav>

      <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-text-muted">
        Demo on in-memory data.
      </p>
    </aside>
  );
}

export function StartupHeading() {
  const pathname = usePathname();
  return (
    <h1 className="truncate text-md font-semibold tracking-tight">
      {currentStartupSection(pathname)}
    </h1>
  );
}
