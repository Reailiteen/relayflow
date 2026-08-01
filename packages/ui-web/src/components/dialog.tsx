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

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-rf-overlay=""
      className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]', className)}
      {...props}
    />
  );
}

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
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
          'rounded-lg bg-surface shadow-lg ring-1 ring-border',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-md font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={cn(
                'mt-0.5 text-sm text-text-secondary',
                srOnlyDescription && 'sr-only',
              )}
            >
              {description}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className={cn(
              'shrink-0 rounded-sm p-1 text-text-muted transition-colors',
              'hover:bg-surface-hover hover:text-text',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <X className="size-3.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>

        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3 px-3 py-3', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1.5 border-t border-border px-3 py-2.5',
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
export interface DrawerContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
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
          'fixed inset-y-0 z-50 flex w-[min(17rem,85vw)] flex-col',
          'bg-surface shadow-xl focus:outline-none',
          side === 'left' ? 'left-0 border-r border-border' : 'right-0 border-l border-border',
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
