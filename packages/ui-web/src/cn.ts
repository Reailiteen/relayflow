import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with later ones winning.
 *
 * The plain string concatenation shadcn ships without this produces
 * `px-3 px-4` and leaves the winner to CSS source order — which is why a
 * component's own padding sometimes ignores the override passed to it.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
