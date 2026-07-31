import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

/**
 * Buttons, sized for a console.
 *
 * `sm` is the default height because most buttons here sit inside table rows
 * and toolbars, where a 40px control would blow the row rhythm apart. The
 * comfortable 32px `md` is for forms and dialogs.
 */
const button = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-md font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow] duration-100',
    // A visible focus ring is not negotiable; keyboard is the primary input for
    // staff working through a queue of thirty items.
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-text hover:bg-accent-hover',
        secondary: cn(
          'bg-surface text-text ring-1 ring-inset ring-border',
          'hover:bg-surface-hover hover:ring-border-strong',
        ),
        ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text',
        danger: 'bg-critical text-white hover:brightness-95',
        link: 'text-accent underline-offset-2 hover:underline',
      },
      size: {
        xs: 'h-6 px-1.5 text-xs [&_svg]:size-3',
        sm: 'h-7 px-2.5 text-sm [&_svg]:size-3.5',
        md: 'h-8 px-3 text-base [&_svg]:size-4',
        icon: 'size-7 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'sm' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  // Defaulting to type="button" prevents the classic bug where an unrelated
  // button inside a filter form submits it.
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />;
}

export { button as buttonVariants };
