/**
 * Deterministic in-memory plan for the release-plan demo.
 *
 * All date math is UTC string-based (`yyyy-mm-dd`) so the visible Friday
 * never shifts under the recording browser's local timezone.
 */

import { DEMO_WORKFLOW_TASKS_BY_SLUG } from './demo-workflow-tasks';

export type MomentType =
  | 'single'
  | 'remix'
  | 'acoustic'
  | 'lyric_video'
  | 'visualizer'
  | 'merch_drop'
  | 'tour_tie_in'
  | 'media_appearance'
  | 'anniversary';

export interface DemoMoment {
  readonly slug: string;
  readonly title: string;
  readonly momentType: MomentType;
  readonly friday: string;
  readonly trackSlug?: string;
  readonly tourDateId?: string;
}

export interface DemoTrack {
  readonly slug: string;
  readonly title: string;
}

export interface DemoTourDate {
  readonly id: string;
  readonly city: string;
  readonly date: string;
}

export interface DemoFanNotification {
  readonly headline: string;
  readonly body: string;
  readonly sendsAt: string;
  readonly channel: 'email' | 'sms';
}

export const EP_TRACKS: readonly DemoTrack[] = Object.freeze([
  { slug: 'midnight-static', title: 'Midnight Static' },
  { slug: 'paper-cathedrals', title: 'Paper Cathedrals' },
  { slug: 'long-way-down', title: 'Long Way Down' },
  { slug: 'no-vacancy', title: 'No Vacancy' },
]);

export const DEMO_TOUR_DATES: readonly DemoTourDate[] = Object.freeze([
  { id: 'la', city: 'Los Angeles', date: '2026-10-26' },
  { id: 'nyc', city: 'New York', date: '2026-11-13' },
  { id: 'chi', city: 'Chicago', date: '2026-11-20' },
]);

export const DEMO_PLAN_START_FRIDAY = '2026-05-01';

const REMIX_SLUG = 'remix-midnight-static';
const LA_TOUR_ID = 'la';

const RAW_MOMENTS: readonly DemoMoment[] = Object.freeze([
  {
    slug: 'single-midnight-static',
    title: 'Midnight Static — lead single',
    momentType: 'single',
    friday: '2026-05-01',
    trackSlug: 'midnight-static',
  },
  {
    slug: 'lyric-video-midnight-static',
    title: 'Midnight Static — lyric video',
    momentType: 'lyric_video',
    friday: '2026-05-08',
    trackSlug: 'midnight-static',
  },
  {
    slug: 'single-paper-cathedrals',
    title: 'Paper Cathedrals — single',
    momentType: 'single',
    friday: '2026-05-22',
    trackSlug: 'paper-cathedrals',
  },
  {
    slug: 'visualizer-paper-cathedrals',
    title: 'Paper Cathedrals — visualizer',
    momentType: 'visualizer',
    friday: '2026-05-29',
    trackSlug: 'paper-cathedrals',
  },
  {
    slug: 'acoustic-midnight-static',
    title: 'Midnight Static — acoustic',
    momentType: 'acoustic',
    friday: '2026-06-05',
    trackSlug: 'midnight-static',
  },
  {
    slug: 'merch-drop-tour-tee',
    title: 'Tour tee + vinyl pre-order',
    momentType: 'merch_drop',
    friday: '2026-06-12',
  },
  {
    slug: 'single-long-way-down',
    title: 'Long Way Down — single',
    momentType: 'single',
    friday: '2026-06-19',
    trackSlug: 'long-way-down',
  },
  {
    slug: 'media-appearance-tiny-desk',
    title: 'Tiny Desk session airs',
    momentType: 'media_appearance',
    friday: '2026-06-26',
  },
  {
    slug: 'single-no-vacancy',
    title: 'No Vacancy — EP closer',
    momentType: 'single',
    friday: '2026-07-03',
    trackSlug: 'no-vacancy',
  },
  {
    slug: 'tour-tie-in-summer',
    title: 'Summer tour announcement',
    momentType: 'tour_tie_in',
    friday: '2026-08-07',
  },
  {
    slug: REMIX_SLUG,
    title: 'Midnight Static (remix)',
    momentType: 'remix',
    friday: '2026-10-16',
    trackSlug: 'midnight-static',
  },
  {
    slug: 'anniversary-midnight-static',
    title: 'Midnight Static — 1 year',
    momentType: 'anniversary',
    friday: '2027-04-30',
    trackSlug: 'midnight-static',
  },
]);

export const DEMO_MOMENTS: readonly DemoMoment[] = RAW_MOMENTS;

// ─── Date helpers (UTC string math) ──────────────────────────────────

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoUtc(iso: string): Date {
  if (!ISO_DATE_RE.test(iso)) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return new Date(`${iso}T00:00:00Z`);
}

function formatIsoUtc(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso: string, days: number): string {
  return formatIsoUtc(new Date(parseIsoUtc(iso).getTime() + days * DAY_MS));
}

export function isFriday(iso: string): boolean {
  return parseIsoUtc(iso).getUTCDay() === 5;
}

/** Friday on or before the given date — anchors a calendar week column. */
export function fridayOfWeek(iso: string): string {
  const d = parseIsoUtc(iso);
  const day = d.getUTCDay();
  const offsetToFriday = (day - 5 + 7) % 7;
  return addDaysIso(iso, -offsetToFriday);
}

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatFridayLong(iso: string): string {
  return LONG_DATE_FORMATTER.format(parseIsoUtc(iso));
}

// ─── Plan generation + transforms ────────────────────────────────────

export function generateDemoPlan(): DemoMoment[] {
  return RAW_MOMENTS.map(m => ({ ...m }));
}

export function laShowFriday(): string {
  const la = DEMO_TOUR_DATES.find(t => t.id === LA_TOUR_ID);
  if (!la) throw new Error('LA tour date missing from DEMO_TOUR_DATES');
  const target = addDaysIso(la.date, -3);
  return isFriday(target) ? target : fridayOfWeek(target);
}

export function moveRemixNearLAShow(plan: DemoMoment[]): DemoMoment[] {
  const target = laShowFriday();
  let mutated = false;
  const next = plan.map(m => {
    if (m.slug !== REMIX_SLUG) return { ...m };
    if (m.friday === target) return { ...m };
    mutated = true;
    return { ...m, friday: target, tourDateId: LA_TOUR_ID };
  });
  if (!mutated) return next;
  next.sort((a, b) => (a.friday < b.friday ? -1 : a.friday > b.friday ? 1 : 0));
  return next;
}

const WORKFLOW_BY_TYPE: Readonly<Record<MomentType, readonly string[]>> =
  Object.freeze({
    single: [
      'upload-master',
      'enter-metadata',
      'pitch-spotify',
      'pitch-apple',
      'finalize-cover-artwork',
      'draft-press-release',
      'create-smart-link',
      'send-fan-notification',
    ],
    remix: [
      'upload-master',
      'enter-metadata',
      'finalize-cover-artwork',
      'update-spotify-bio',
      'create-smart-link',
      'send-fan-notification',
      'review-analytics',
    ],
    acoustic: [
      'upload-master',
      'enter-metadata',
      'finalize-cover-artwork',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
    ],
    lyric_video: [
      'finalize-cover-artwork',
      'submit-genius',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
    visualizer: [
      'finalize-cover-artwork',
      'upload-canvas',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
    merch_drop: [
      'finalize-cover-artwork',
      'draft-press-release',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
    tour_tie_in: [
      'finalize-cover-artwork',
      'draft-press-release',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
    media_appearance: [
      'draft-press-release',
      'update-spotify-bio',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
    anniversary: [
      'finalize-cover-artwork',
      'update-spotify-bio',
      'create-smart-link',
      'feature-on-profile',
      'send-fan-notification',
      'review-analytics',
    ],
  });

export function workflowTaskSlugsForMoment(t: MomentType): string[] {
  const slugs = WORKFLOW_BY_TYPE[t];
  for (const slug of slugs) {
    if (!(slug in DEMO_WORKFLOW_TASKS_BY_SLUG)) {
      throw new Error(`Unknown workflow task slug: ${slug}`);
    }
  }
  return [...slugs];
}

const NOTIFICATION_HEADLINES: Readonly<Record<MomentType, string>> = {
  single: 'New single drops Friday',
  remix: 'New remix this Friday',
  acoustic: 'Acoustic version — Friday',
  lyric_video: 'Lyric video — Friday',
  visualizer: 'New visualizer — Friday',
  merch_drop: 'Merch + vinyl drop — Friday',
  tour_tie_in: 'Tour news — Friday',
  media_appearance: 'New session — Friday',
  anniversary: 'One year of Midnight Static',
};

export function fanNotificationForMoment(m: DemoMoment): DemoFanNotification {
  return {
    headline: NOTIFICATION_HEADLINES[m.momentType],
    body: `${m.title} — out ${formatFridayLong(m.friday)}.`,
    sendsAt: m.friday,
    channel: 'email',
  };
}
