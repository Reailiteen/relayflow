import { cn } from '@relayflow/ui-web';

/**
 * The frame every portal sits in.
 *
 * A 70px top bar over a scrolling work area, with one soft lavender bloom from
 * the top right of the canvas — which is what stops a page of white cards on
 * near-white reading as flat.
 */

export function TopBar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <header
      className={cn(
        'flex h-[var(--rf-topbar-h)] shrink-0 items-center gap-4',
        'border-b border-hairline bg-panel pr-[20px] pl-[30px]',
        className,
      )}
      {...props}
    />
  );
}

export function Workspace({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      className={cn('min-h-0 flex-1 overflow-y-auto bg-canvas', className)}
      // `local` keeps the wash anchored to the content rather than the frame.
      style={{
        backgroundImage:
          'radial-gradient(90% 55% at 84% -14%, var(--rf-canvas-wash) 0%, transparent 62%)',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'local',
      }}
      {...props}
    />
  );
}

/**
 * The standard page padding.
 *
 * Every screen in every portal opens with this, so the left edge of a table on
 * the allocation screen lines up with the left edge of a card on the dashboard.
 */
export function Page({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-[var(--rf-gap)]',
        'px-[var(--rf-page-x)] pt-[var(--rf-page-y)] pb-10',
        className,
      )}
      {...props}
    />
  );
}

export interface PageHeadingProps {
  title: React.ReactNode;
  /** Sits under the title: counts, dates, the one line of context. */
  meta?: React.ReactNode | undefined;
  /** Badges and the like, between the title and the meta line. */
  badge?: React.ReactNode | undefined;
  /** Right-aligned controls. */
  actions?: React.ReactNode | undefined;
}

export function PageHeading({ title, meta, badge, actions }: PageHeadingProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-display leading-tight font-bold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {badge ? <div className="mt-2 flex flex-wrap items-center gap-2">{badge}</div> : null}
        {meta ? <p className="mt-3 text-[14px] text-ink-3">{meta}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
