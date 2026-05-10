/**
 * Seed data for the HomeComposerHero autoplay demo on the marketing homepage.
 *
 * Keep copy in data files, not inline JSX (per CLAUDE.md homepage rules).
 * These are realistic placeholder values — not invented stats, not testimonials.
 */

export const TYPEWRITER_QUERY = 'Build the launch plan for The Deep End.';

/** Delay between each typed character in the autoplay sequence (ms). */
export const TYPEWRITER_CHAR_INTERVAL = 40;

/** How long to hold the empty phase before typing starts (ms). */
export const PHASE_EMPTY_DURATION = 700;

/** How long to hold the typing phase total before advancing to entity (ms). */
export const PHASE_TYPING_DURATION = 3000;

/** How long to hold the entity phase before looping (ms). */
export const PHASE_ENTITY_DURATION = 5200;

/** How long to wait after mouseLeave before resuming autoplay (ms). */
export const RESUME_DELAY_AFTER_HOVER = 1000;

export interface DemoRelease {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly year: string;
  /** Placeholder background color for the artwork tile. */
  readonly artBg: string;
}

export const DEMO_RELEASES: readonly DemoRelease[] = [
  {
    id: 'deep-end',
    label: 'The Deep End',
    type: 'Single',
    year: '2026',
    artBg: '#0b1118',
  },
  {
    id: 'take-me-over',
    label: 'Take Me Over',
    type: 'Single',
    year: '2026',
    artBg: '#101626',
  },
  {
    id: 'never-say',
    label: 'Never Say',
    type: 'Single',
    year: '2026',
    artBg: '#14101e',
  },
] as const;

export interface DemoStat {
  readonly key: string;
  readonly label: string;
  /** When true, renders as a solid badge (e.g. "Sold out") rather than plain text. */
  readonly solid?: true;
}

export const MIDNIGHT_RUN_STATS: readonly DemoStat[] = [
  { key: 'artist', label: 'Cosmic Gate & Tim White' },
  { key: 'type', label: 'Single' },
  { key: 'status', label: 'Live' },
] as const;

export interface DemoAction {
  readonly key: string;
  readonly label: string;
  readonly body: string;
  readonly status: string;
}

export const DEMO_RELEASE_ACTIONS: readonly DemoAction[] = [
  {
    key: 'fan-path',
    label: 'Fan path',
    body: 'Smart link, presave fallback, and profile update generated.',
    status: 'Ready',
  },
  {
    key: 'tasks',
    label: 'Launch tasks',
    body: 'Artwork, DSP checks, post copy, and UTM review assigned.',
    status: '8 tasks',
  },
  {
    key: 'notify',
    label: 'Fan notification',
    body: 'Opted-in listeners get the release when the link goes live.',
    status: 'Queued',
  },
] as const;

export const DEMO_ARTIST = {
  label: 'Tim White',
  handle: '@tim',
  url: 'jov.ie/tim',
} as const;

export const DEMO_TOUR = {
  date: 'May 12, 2025 (archived)',
  venue: 'Brooklyn Steel',
  city: 'Brooklyn, NY',
  provider: 'Bandsintown',
  status: 'Sold out',
} as const;
