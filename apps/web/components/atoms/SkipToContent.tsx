import { cn } from '@/lib/utils';

export interface SkipToContentProps {
  /** The ID of the target element to skip to (without the # prefix) */
  readonly targetId?: string;
  /** The text to display in the skip link */
  readonly linkText?: string;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * SkipToContent - A visually hidden skip link for keyboard accessibility.
 *
 * This component renders a link that is hidden from view by default but becomes
 * visible when focused via keyboard navigation. It allows users to skip directly
 * to the main content, bypassing navigation and other repeating elements.
 *
 * This is a WCAG 2.1 Level A requirement (2.4.1 Bypass Blocks).
 */
export function SkipToContent({
  targetId = 'main-content',
  linkText = 'Skip to content',
  className,
}: SkipToContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        // Visually hidden by default
        'sr-only',
        // Visible when focused
        'focus:not-sr-only',
        // Styling when visible
        'focus:fixed focus:left-4 focus:top-4 focus:z-50',
        'focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2',
        'focus:text-sm focus:text-primary-token focus:shadow-lg',
        'focus:ring-2 focus:ring-accent',
        className
      )}
    >
      {linkText}
    </a>
  );
}
