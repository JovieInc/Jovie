import type { DetectedLink } from '@/lib/utils/platform-detection';

/**
 * Check if a link is visible based on its isVisible property
 */
export function linkIsVisible<T extends DetectedLink>(link: T): boolean {
  return (
    ((link as unknown as { isVisible?: boolean }).isVisible ?? true) !== false
  );
}

/**
 * Generate a stable ID for a link
 */
export function idFor<T extends DetectedLink>(link: T): string {
  return `${link.platform.id}::${link.normalizedUrl || link.originalUrl || ''}`;
}
