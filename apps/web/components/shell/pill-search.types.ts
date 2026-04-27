/**
 * Shared types for the shell PillSearch component.
 *
 * Lives in its own module so sibling components and consumers can import the
 * type without dragging in the JSX runtime.
 */

/**
 * Filter axis. Each pill targets exactly one field with an `is` / `is not`
 * operator and one or more OR-combined values. Only fields the component
 * can actually complete are exposed here — `bpm` and `key` were dropped
 * from the original shell-v1 set because they don't have value options
 * and would land users in a dead-end state if surfaced via the slash menu.
 */
export type FilterField = 'artist' | 'title' | 'album' | 'status' | 'has';

export interface FilterPill {
  /** Stable identifier used for React keys and pill mutation callbacks. */
  readonly id: string;
  readonly field: FilterField;
  readonly op: 'is' | 'is not';
  readonly values: readonly string[];
}

/** Human-readable label per field — used in pill chips and slash menu rows. */
export const FIELD_LABEL: Record<FilterField, string> = {
  artist: 'Artist',
  title: 'Title',
  album: 'Album',
  status: 'Status',
  has: 'Has',
};

/** Closed enum of release statuses surfaced as suggestions. */
export const STATUS_VALUES = [
  'live',
  'scheduled',
  'announced',
  'draft',
  'hidden',
] as const;

/** Closed enum of "has" tags surfaced as suggestions. */
export const HAS_VALUES = ['video', 'canvas'] as const;

/** Slash-command aliases — `/track` maps to title, etc. */
export const SLASH_ALIAS: Record<string, FilterField> = {
  track: 'title',
};
