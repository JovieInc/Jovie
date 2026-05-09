/**
 * Seed data for the HomeComposerHero autoplay demo on the marketing homepage.
 *
 * Keep copy in data files, not inline JSX (per CLAUDE.md homepage rules).
 * These are realistic placeholder values — not invented stats, not testimonials.
 */

export const TYPEWRITER_QUERY = 'What did Midnight Run do in its first week?';

/** Delay between each typed character in the autoplay sequence (ms). */
export const TYPEWRITER_CHAR_INTERVAL = 40;

/** How long to hold the empty phase before typing starts (ms). */
export const PHASE_EMPTY_DURATION = 2000;

/** How long to hold the typing phase total before advancing to entity (ms). */
export const PHASE_TYPING_DURATION = 3000;

/** How long to hold the entity phase before looping (ms). */
export const PHASE_ENTITY_DURATION = 4000;

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
    id: 'midnight-run',
    label: 'Midnight Run',
    type: 'Album',
    year: '2026',
    artBg: '#1a1a2e',
  },
  {
    id: 'static',
    label: 'Static',
    type: 'Single',
    year: '2026',
    artBg: '#0d1b2a',
  },
  {
    id: 'dawnward',
    label: 'Dawnward',
    type: 'EP',
    year: '2025',
    artBg: '#1a0a1e',
  },
] as const;

export interface DemoStat {
  readonly key: string;
  readonly label: string;
  /** When true, renders as a solid badge (e.g. "Sold out") rather than plain text. */
  readonly solid?: true;
}

export const MIDNIGHT_RUN_STATS: readonly DemoStat[] = [
  { key: 'tracks', label: '9 tracks' },
  { key: 'date', label: 'Mar 14, 2026' },
  { key: 'duration', label: '42:17' },
  { key: 'spotify', label: 'Spotify 71' },
  { key: 'first-week', label: '142k 1st-week' },
  { key: 'features', label: '2 features' },
] as const;

export const DEMO_ARTIST = {
  label: 'Tim White',
  handle: '@tim',
  url: 'jov.ie/tim',
} as const;

export const DEMO_TOUR = {
  date: 'May 12',
  venue: 'Brooklyn Steel',
  city: 'Brooklyn, NY',
  provider: 'Bandsintown',
  status: 'Sold out',
} as const;
