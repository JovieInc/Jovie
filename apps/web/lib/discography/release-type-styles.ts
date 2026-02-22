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
  /** Background color classes for badge rendering */
  bg: string;
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
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    label: 'Single',
  },
  ep: {
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    label: 'EP',
  },
  album: {
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/40',
    label: 'Album',
  },
  compilation: {
    border: 'border-amber-300 dark:border-amber-700',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    label: 'Compilation',
  },
  live: {
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/40',
    label: 'Live',
  },
  mixtape: {
    border: 'border-pink-300 dark:border-pink-700',
    text: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    label: 'Mixtape',
  },
  other: {
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900/40',
    label: 'Other',
  },
};

/**
 * Get the style for a release type, with fallback to 'other'.
 */
export function getReleaseTypeStyle(type: string): ReleaseTypeStyle {
  return RELEASE_TYPE_STYLES[type] ?? RELEASE_TYPE_STYLES.other;
}
