/**
 * Release Type Styling Configuration
 *
 * Shared styling for release type badges across the application.
 */

export interface ReleaseTypeStyle {
  /** Border color classes */
  border: string;
  /** Text color classes */
  text: string;
  /** Display label */
  label: string;
}

/**
 * Styling configuration for each release type.
 * Uses bordered badge style for subtle visual distinction.
 */
export const RELEASE_TYPE_STYLES: Record<string, ReleaseTypeStyle> = {
  single: {
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-600 dark:text-blue-400',
    label: 'Single',
  },
  ep: {
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-600 dark:text-purple-400',
    label: 'EP',
  },
  album: {
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-600 dark:text-green-400',
    label: 'Album',
  },
  compilation: {
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Compilation',
  },
  live: {
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-600 dark:text-red-400',
    label: 'Live',
  },
  mixtape: {
    border: 'border-pink-300 dark:border-pink-700',
    text: 'text-pink-600 dark:text-pink-400',
    label: 'Mixtape',
  },
  other: {
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-600 dark:text-gray-400',
    label: 'Other',
  },
};

/**
 * Get the style for a release type, with fallback to 'other'.
 */
export function getReleaseTypeStyle(type: string): ReleaseTypeStyle {
  return RELEASE_TYPE_STYLES[type] ?? RELEASE_TYPE_STYLES.other;
}
