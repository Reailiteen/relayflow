import { useId } from 'react';
import { cn } from '../cn';

/**
 * Labelled form controls.
 *
 * The label is a required prop rather than something the caller composes, so a
 * field cannot ship without one. `useId` wires the association and any error
 * message through `aria-describedby`, which is what makes the error audible to
 * a screen reader rather than merely visible.
 */

const CONTROL = cn(
  'w-full rounded-md bg-surface px-2 py-1.5 text-base text-text',
  'ring-1 ring-inset ring-border placeholder:text-text-muted',
  'transition-shadow outline-none',
  'focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:ring-critical',
);

interface FieldShellProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
}

function Shell({
  label,
  hint,
  error,
  required,
  controlId,
  describedBy,
  children,
}: FieldShellProps & {
  controlId: string;
  describedBy: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={controlId} className="text-sm font-medium text-text">
        {label}
        {required && (
          <span className="ml-0.5 text-critical" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {(hint ?? error) && (
        <p
          id={describedBy}
          className={cn('text-xs', error ? 'text-critical-text' : 'text-text-muted')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'>,
    FieldShellProps {}

export function TextField({ label, hint, error, required, className, ...props }: TextFieldProps) {
  const id = useId();
  const describedBy = `${id}-describe`;

  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      required={required}
      controlId={id}
      describedBy={describedBy}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={(hint ?? error) ? describedBy : undefined}
        required={required}
        className={cn(CONTROL, className)}
        {...props}
      />
    </Shell>
  );
}

export interface TextAreaFieldProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    FieldShellProps {}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  rows = 3,
  ...props
}: TextAreaFieldProps) {
  const id = useId();
  const describedBy = `${id}-describe`;

  return (
    <Shell
      label={label}
      hint={hint}
      error={error}
      required={required}
      controlId={id}
      describedBy={describedBy}
    >
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={(hint ?? error) ? describedBy : undefined}
        required={required}
        className={cn(CONTROL, 'resize-y', className)}
        {...props}
      />
    </Shell>
  );
}
