'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../cn';

/**
 * Modal dialog, on Radix.
 *
 * Radix rather than a hand-rolled overlay because focus trapping, scroll
 * locking, Escape handling and `aria-modal` wiring are all things that are easy
 * to get 90% right and that 90% is exactly what breaks for keyboard and screen
 * reader users. This is also what backs the navigation drawer.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Context-preserving workflow panel.
 *
 * Unlike DrawerContent, this intentionally renders no overlay. Creation,
 * editing and record inspection should keep the operational page visible
 * behind the panel rather than turning it into a modal backdrop.
 */
export const SidePanel = DialogPrimitive.Root;
export const SidePanelTrigger = DialogPrimitive.Trigger;
export const SidePanelClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-rf-overlay=""
      className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]', className)}
      {...props}
    />
  );
}

export interface DialogContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  /** Required: screen readers announce it, and it forces the author to say
   *  what the dialog is for. Pass `srOnlyDescription` to hide it visually. */
  description: string;
  srOnlyDescription?: boolean | undefined;
}

export function DialogContent({
  title,
  description,
  srOnlyDescription = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-rf-dialog=""
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md',
          '-translate-x-1/2 -translate-y-1/2',
          'rounded-card border border-hairline bg-surface shadow-overlay',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-bold tracking-[-0.01em] text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={cn('mt-1 text-xs text-ink-3', srOnlyDescription && 'sr-only')}
            >
              {description}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className={cn(
              'shrink-0 rounded-control p-1.5 text-ink-3 transition-colors',
              'hover:bg-surface-hover hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>

        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-4 px-5 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-hairline px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

export interface SidePanelContentProps extends React.ComponentProps<
  typeof DialogPrimitive.Content
> {
  title: string;
  description: string;
  width?: 'md' | 'lg' | 'xl' | undefined;
}

export function SidePanelContent({
  title,
  description,
  width = 'lg',
  className,
  children,
  ...props
}: SidePanelContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Content
        data-rf-side-panel=""
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col',
          'border-l border-hairline bg-panel shadow-overlay focus:outline-none',
          width === 'md' && 'sm:max-w-lg',
          width === 'lg' && 'sm:max-w-2xl',
          width === 'xl' && 'sm:max-w-4xl',
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-title font-bold tracking-[-0.01em] text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 max-w-2xl text-xs leading-5 text-ink-3">
              {description}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-control text-ink-3',
              'hover:bg-surface-hover hover:text-ink',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SidePanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6', className)} {...props} />
  );
}

export function SidePanelFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline bg-panel px-5 py-4 sm:px-6',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Side drawer, built on the same primitive so it inherits the focus trap.
 *
 * Used for navigation: at console density a permanent sidebar costs a whole
 * table column, and the sections are visited far less often than the data is
 * read.
 */
export interface DrawerContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
  description: string;
  side?: 'left' | 'right' | undefined;
}

export function DrawerContent({
  title,
  description,
  side = 'left',
  className,
  children,
  ...props
}: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-rf-drawer=""
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(var(--rf-rail-w),85vw)] flex-col',
          'bg-rail shadow-overlay focus:outline-none',
          side === 'left' ? 'left-0 border-r border-hairline' : 'right-0 border-l border-hairline',
          className,
        )}
        {...props}
      >
        {/* Announced, not shown — the drawer's heading is rendered below. */}
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
