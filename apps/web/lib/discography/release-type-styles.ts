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
  /** Dot indicator color class */
  dot: string;
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
    border: 'border-sky-500/15 dark:border-sky-400/15',
    text: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-500/8 dark:bg-sky-400/10',
    dot: 'bg-sky-500',
    label: 'Single',
  },
  ep: {
    border: 'border-violet-500/15 dark:border-violet-400/15',
    text: 'text-violet-700 dark:text-violet-300',
    bg: 'bg-violet-500/8 dark:bg-violet-400/10',
    dot: 'bg-violet-500',
    label: 'EP',
  },
  album: {
    border: 'border-emerald-500/15 dark:border-emerald-400/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/8 dark:bg-emerald-400/10',
    dot: 'bg-emerald-500',
    label: 'Album',
  },
  compilation: {
    border: 'border-amber-500/15 dark:border-amber-400/15',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-500/8 dark:bg-amber-400/10',
    dot: 'bg-amber-500',
    label: 'Compilation',
  },
  live: {
    border: 'border-rose-500/15 dark:border-rose-400/15',
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-500/8 dark:bg-rose-400/10',
    dot: 'bg-rose-500',
    label: 'Live',
  },
  mixtape: {
    border: 'border-pink-500/15 dark:border-pink-400/15',
    text: 'text-pink-700 dark:text-pink-300',
    bg: 'bg-pink-500/8 dark:bg-pink-400/10',
    dot: 'bg-pink-500',
    label: 'Mixtape',
  },
  music_video: {
    border: 'border-red-500/15 dark:border-red-400/15',
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-500/8 dark:bg-red-400/10',
    dot: 'bg-red-500',
    label: 'Music Video',
  },
  other: {
    border: 'border-black/8 dark:border-white/8',
    text: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-black/[0.03] dark:bg-white/[0.04]',
    dot: 'bg-zinc-400',
    label: 'Other',
  },
};

/**
 * Get the style for a release type, with fallback to 'other'.
 */
export function getReleaseTypeStyle(type: string): ReleaseTypeStyle {
  return RELEASE_TYPE_STYLES[type] ?? RELEASE_TYPE_STYLES.other;
}
