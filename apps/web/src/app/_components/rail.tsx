'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlignLeft, ExternalLink, Sparkles, type LucideIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogTrigger, DrawerContent, cn } from '@relayflow/ui-web';

/**
 * The navigation rail, shared by every portal that has one.
 *
 * QSTP and the startup portal are different products with different section
 * lists, but they are the same piece of furniture: a 248px rail, 48px rows, the
 * brand at the top and support at the bottom. Writing it twice is how the two
 * end up with different row heights and nobody notices for a month.
 *
 * Below `lg` it becomes a drawer — a fixed rail on a phone leaves almost
 * nothing for the tables. Both forms render the same list from one definition.
 */

export interface RailSection {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/**
 * Which section a path belongs to.
 *
 * Exact match wins, then the longest prefix — so /startup/positions/new still
 * reads as "Positions" while /startup itself does not swallow everything under
 * it. `homeHref` is excluded from prefix matching for exactly that reason.
 */
export function sectionFor(
  sections: readonly RailSection[],
  pathname: string,
  homeHref: string,
): RailSection | undefined {
  const exact = sections.find((section) => section.href === pathname);
  if (exact) return exact;

  return [...sections]
    .filter((section) => section.href !== homeHref)
    .sort((a, b) => b.href.length - a.href.length)
    .find((section) => pathname.startsWith(section.href + '/'));
}

/* ── Shell state ──────────────────────────────────────────────────────────── */

const RailContext = createContext<{ hidden: boolean; toggle: () => void }>({
  hidden: false,
  toggle: () => {},
});

/**
 * Holds whether the rail is showing.
 *
 * A provider rather than props because the rail and the button that hides it
 * sit on opposite sides of the layout's `children`, and threading a setter
 * through a server component is not possible.
 */
export function RailProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const value = useMemo(() => ({ hidden, toggle: () => setHidden((v) => !v) }), [hidden]);
  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** The mark and the wordmark, at the height of the top bar beside it. */
export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex h-[72px] shrink-0 items-center gap-3 px-[17px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      )}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-brand-tint"
        aria-hidden="true"
      >
        <span className="text-[15px] leading-none font-bold tracking-[-0.06em] text-brand">RF</span>
      </span>
      <span
        className="text-[24px] leading-none font-bold tracking-[-0.01em] text-ink"
        style={{ fontFamily: 'var(--rf-font-wordmark)' }}
      >
        RelayFlow
      </span>
    </Link>
  );
}

function SectionList({
  sections,
  homeHref,
  pathname,
  wrapLink,
}: {
  sections: readonly RailSection[];
  homeHref: string;
  pathname: string;
  wrapLink?: ((node: React.ReactNode, key: string) => React.ReactNode) | undefined;
}) {
  const current = sectionFor(sections, pathname, homeHref);

  return (
    <nav
      aria-label="Sections"
      className="flex min-h-0 flex-col gap-2 overflow-y-auto pt-6 pr-5 pl-[11px]"
    >
      {sections.map((section) => {
        const active = current?.href === section.href;
        const Icon = section.icon;

        const link = (
          <Link
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-12 items-center gap-6 rounded-tile px-[13px] text-body transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              active
                ? 'bg-brand-soft font-semibold text-brand'
                : 'font-medium text-ink-2 hover:bg-brand-soft/60 hover:text-ink',
            )}
          >
            <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate">{section.label}</span>
          </Link>
        );

        return wrapLink ? wrapLink(link, section.href) : <div key={section.href}>{link}</div>;
      })}
    </nav>
  );
}

/**
 * The support card, pinned to the bottom of the rail.
 *
 * The destination is not wired yet — there is no help centre to point at — so
 * the button is present but inert rather than linking somewhere that 404s.
 */
function HelpCard() {
  return (
    <div className="mx-[17px] mb-4 rounded-card border border-hairline p-[18px]">
      <div className="flex items-center gap-2 text-brand">
        <Sparkles className="size-4" aria-hidden="true" />
        <span className="text-label font-semibold">Need help?</span>
      </div>
      <p className="mt-2.5 text-meta leading-[1.6] text-ink-3">
        Visit our Help Center for guides and support.
      </p>
      <button
        type="button"
        className={cn(
          'mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-control',
          'border border-hairline-strong bg-panel text-meta font-semibold text-brand',
          'transition-colors hover:bg-brand-soft',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        )}
      >
        Open Help Center
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Colophon() {
  return (
    <p className="shrink-0 px-[23px] pb-6 text-meta leading-[1.7] text-ink-3">
      © 2026 RelayFlow, Inc.
      <br />
      All rights reserved.
    </p>
  );
}

export interface RailProps {
  sections: readonly RailSection[];
  /** The portal's own root. Excluded from prefix matching. */
  homeHref: string;
  /** An optional "you are here" block under the brand — the startup's name. */
  context?: { label: string; value: string } | undefined;
}

function RailBody({ sections, homeHref, context, pathname, wrapLink }: RailProps & {
  pathname: string;
  wrapLink?: ((node: React.ReactNode, key: string) => React.ReactNode) | undefined;
}) {
  return (
    <>
      <Brand href={homeHref} />

      {context && (
        <div className="mx-[17px] shrink-0 rounded-tile bg-surface-sunken px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {context.label}
          </div>
          <div className="mt-0.5 truncate text-label font-semibold text-ink">{context.value}</div>
        </div>
      )}

      <SectionList
        sections={sections}
        homeHref={homeHref}
        pathname={pathname}
        {...(wrapLink ? { wrapLink } : {})}
      />

      <div className="mt-auto shrink-0">
        <HelpCard />
        <Colophon />
      </div>
    </>
  );
}

/** Always-on rail. Hidden below `lg`, where the drawer takes over. */
export function Rail(props: RailProps) {
  const pathname = usePathname();
  const { hidden } = useContext(RailContext);

  return (
    <aside
      className={cn(
        'w-[var(--rf-rail-w)] shrink-0 flex-col border-r border-hairline bg-rail',
        hidden ? 'hidden' : 'hidden lg:flex',
      )}
    >
      <RailBody {...props} pathname={pathname} />
    </aside>
  );
}

const TRIGGER = cn(
  'grid size-9 shrink-0 place-items-center rounded-control text-ink-2',
  'transition-colors hover:bg-surface-hover hover:text-ink',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
);

/**
 * The top bar's menu button.
 *
 * Two controls that look identical, because they do different things: below
 * `lg` there is no rail to hide, so it opens the drawer instead.
 */
export function RailToggle(props: RailProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { hidden, toggle } = useContext(RailContext);

  // Close on navigation, or the drawer sits over the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className={cn(TRIGGER, 'lg:hidden')} aria-label="Open navigation">
          <AlignLeft className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
        </DialogTrigger>

        <DrawerContent title="Navigation" description="Move between sections of RelayFlow.">
          <RailBody
            {...props}
            pathname={pathname}
            wrapLink={(node, key) => (
              <DialogClose asChild key={key}>
                {node}
              </DialogClose>
            )}
          />
        </DrawerContent>
      </Dialog>

      <button
        type="button"
        onClick={toggle}
        aria-expanded={!hidden}
        aria-label={hidden ? 'Show navigation' : 'Hide navigation'}
        className={cn(TRIGGER, 'hidden lg:grid')}
      >
        <AlignLeft className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </>
  );
}

/**
 * The page heading, in the top bar rather than repeated on every page.
 *
 * Suppressed on each portal's home screen, which names the cycle or the startup
 * it is showing in its own `h1` — two headings a few pixels apart would say the
 * same thing twice.
 */
export function CurrentSection({
  sections,
  homeHref,
}: {
  sections: readonly RailSection[];
  homeHref: string;
}) {
  const pathname = usePathname();
  if (pathname === homeHref) return null;

  const current = sectionFor(sections, pathname, homeHref);

  return (
    <h1 className="truncate text-title font-bold tracking-[-0.01em] text-ink">
      {current?.label ?? 'RelayFlow'}
    </h1>
  );
}
