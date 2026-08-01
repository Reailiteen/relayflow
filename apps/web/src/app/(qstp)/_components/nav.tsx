'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  Menu,
  Recycle,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge, Dialog, DialogClose, DialogTrigger, DrawerContent, cn } from '@relayflow/ui-web';

/**
 * Navigation: a permanently visible sidebar.
 *
 * Below `lg` it collapses to a drawer — a fixed rail on a phone would leave
 * almost nothing for the tables — but on any screen wide enough to work in, the
 * menu is simply always there. Both forms render the same section list from one
 * definition, so they cannot drift apart.
 */

const SECTIONS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, ready: true },
  { href: '/startups', label: 'Startups', icon: Boxes, ready: false },
  { href: '/allocation', label: 'Allocation', icon: Wallet, ready: true },
  { href: '/positions', label: 'Positions', icon: ClipboardList, ready: false },
  { href: '/candidates', label: 'Candidates', icon: Users, ready: false },
  { href: '/selection', label: 'Selection', icon: ShieldAlert, ready: true },
  { href: '/exceptions', label: 'Exceptions', icon: CalendarClock, ready: true },
  { href: '/redistribution', label: 'Redistribution', icon: Recycle, ready: true },
  { href: '/documents', label: 'Documents', icon: FileCheck2, ready: false },
] as const;

export function currentSectionLabel(pathname: string): string {
  return SECTIONS.find((section) => section.href === pathname)?.label ?? 'RelayFlow';
}

/**
 * The list itself. `wrapLink` lets the drawer wrap each item in a DialogClose
 * so it dismisses on navigate, while the sidebar — which never dismisses —
 * renders the link bare.
 */
function SectionList({
  pathname,
  wrapLink,
}: {
  pathname: string;
  wrapLink?: ((node: React.ReactNode, key: string) => React.ReactNode) | undefined;
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5"
    >
      {SECTIONS.map((section) => {
        const active = pathname === section.href;
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

        const link = (
          <Link
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

        return wrapLink ? wrapLink(link, section.href) : <div key={section.href}>{link}</div>;
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
      <span className="text-md font-semibold tracking-tight">RelayFlow</span>
    </div>
  );
}

function Footnote() {
  return (
    <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-text-muted">
      Demo on in-memory data. No database, no authentication.
    </p>
  );
}

/** Always-on sidebar. Hidden below `lg`, where the drawer takes over. */
export function QstpSidebar({ cycleName }: { cycleName?: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <Brand />

      {cycleName && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">
            Active cycle
          </div>
          <div className="truncate text-sm text-text">{cycleName}</div>
        </div>
      )}

      <SectionList pathname={pathname} />
      <Footnote />
    </aside>
  );
}

/** Drawer form, for screens too narrow to spare the rail. */
export function QstpMobileNav({ cycleName }: { cycleName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation, or the drawer sits over the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          'rounded-md p-1 text-text-secondary lg:hidden',
          'transition-colors hover:bg-surface-hover hover:text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label="Open navigation"
      >
        <Menu className="size-4" aria-hidden="true" />
      </DialogTrigger>

      <DrawerContent title="Navigation" description="Move between sections of RelayFlow.">
        <Brand />
        {cycleName && (
          <div className="shrink-0 border-b border-border px-3 py-2">
            <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">
              Active cycle
            </div>
            <div className="truncate text-sm text-text">{cycleName}</div>
          </div>
        )}
        <SectionList
          pathname={pathname}
          wrapLink={(node, key) => (
            <DialogClose asChild key={key}>
              {node}
            </DialogClose>
          )}
        />
        <Footnote />
      </DrawerContent>
    </Dialog>
  );
}

/**
 * The page heading, in the top bar rather than repeated on every page.
 *
 * This is the document's single `h1`. Putting it in the chrome means each
 * screen states its purpose once — the section name here, the descriptive line
 * on the page — instead of saying "Allocation" twice a few pixels apart.
 */
export function CurrentSection() {
  const pathname = usePathname();
  return (
    <h1 className="truncate text-md font-semibold tracking-tight">
      {currentSectionLabel(pathname)}
    </h1>
  );
}
