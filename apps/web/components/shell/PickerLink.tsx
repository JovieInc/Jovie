import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickerLinkProps {
  readonly href: string;
  readonly label: string;
  readonly className?: string;
}

/**
 * PickerLink — full-width navigational link inside a picker / dropdown
 * surface. 24px tall, label on the left, chevron on the right.
 *
 * Renders as an anchor (not a button) — intended for navigation that
 * should be openable in a new tab via right-click or middle-click.
 *
 * @example
 * ```tsx
 * <PickerLink href='/help' label='Help & docs' />
 * ```
 */
export function PickerLink({ href, label, className }: PickerLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'flex items-center justify-between h-6 px-1.5 rounded text-[11px] text-secondary-token hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
        className
      )}
    >
      <span>{label}</span>
      <ChevronRight
        aria-hidden='true'
        className='h-3 w-3 text-quaternary-token'
        strokeWidth={2.25}
      />
    </a>
  );
}
