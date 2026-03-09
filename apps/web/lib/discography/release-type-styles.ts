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
 * Uses soft opacity-based colors for subtle visual distinction
 * that adapts cleanly to both light and dark modes.
 */
export const RELEASE_TYPE_STYLES: Record<string, ReleaseTypeStyle> = {
  single: {
    border: 'border-blue-500/20',
    text: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-500/10',
    label: 'Single',
  },
  ep: {
    border: 'border-violet-500/20',
    text: 'text-violet-600 dark:text-violet-300',
    bg: 'bg-violet-500/10',
    label: 'EP',
  },
  album: {
    border: 'border-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-500/10',
    label: 'Album',
  },
  compilation: {
    border: 'border-amber-500/20',
    text: 'text-amber-600 dark:text-amber-300',
    bg: 'bg-amber-500/10',
    label: 'Compilation',
  },
  live: {
    border: 'border-rose-500/20',
    text: 'text-rose-600 dark:text-rose-300',
    bg: 'bg-rose-500/10',
    label: 'Live',
  },
  mixtape: {
    border: 'border-pink-500/20',
    text: 'text-pink-600 dark:text-pink-300',
    bg: 'bg-pink-500/10',
    label: 'Mixtape',
  },
  other: {
    border: 'border-gray-500/20',
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-500/10',
    label: 'Other',
  },
};

/**
 * Get the style for a release type, with fallback to 'other'.
 */
export function getReleaseTypeStyle(type: string): ReleaseTypeStyle {
  return RELEASE_TYPE_STYLES[type] ?? RELEASE_TYPE_STYLES.other;
}
