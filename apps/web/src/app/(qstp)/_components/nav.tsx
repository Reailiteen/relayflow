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
 * Navigation drawer.
 *
 * A drawer rather than a persistent sidebar because this is a dense console: a
 * 240px rail costs a whole table column on every screen, and sections are
 * navigated between far less often than the data on them is read. The drawer
 * gives the full menu when wanted and none of the width when not.
 *
 * It is built on the dialog primitive, so it inherits the focus trap, Escape
 * handling and scroll lock rather than reimplementing them.
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

export function QstpNav({ cycleName }: { cycleName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation. Without this the drawer stays open over the page you
  // just asked for, which reads as the click not having worked.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const current = SECTIONS.find((section) => section.href === pathname);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-text-secondary',
          'transition-colors hover:bg-surface-hover hover:text-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label="Open navigation"
      >
        <Menu className="size-4" aria-hidden="true" />
        {/* The current section doubles as the trigger's label, so the header
            still says where you are without a separate breadcrumb. */}
        <span className="font-medium text-text">{current?.label ?? 'Menu'}</span>
      </DialogTrigger>

      <DrawerContent title="Navigation" description="Move between sections of RelayFlow.">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-md font-semibold tracking-tight">RelayFlow</span>
        </div>

        {cycleName && (
          <div className="shrink-0 border-b border-border px-3 py-2">
            <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">
              Active cycle
            </div>
            <div className="truncate text-sm text-text">{cycleName}</div>
          </div>
        )}

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
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

            return (
              <DialogClose asChild key={section.href}>
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
              </DialogClose>
            );
          })}
        </nav>

        <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-text-muted">
          Demo on in-memory data. No database, no authentication.
        </p>
      </DrawerContent>
    </Dialog>
  );
}
