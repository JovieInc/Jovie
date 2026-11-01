/**
 * Creator segment taxonomy and inference (JOV-9679).
 *
 * The `creator_type` DB enum stays artist | podcaster | influencer | creator.
 * The finer segment is derived at read time from signals we already hold, or
 * set explicitly in `creator_profiles.settings.segment` (existing jsonb, so no
 * migration). Low confidence resolves to NEUTRAL: Jovie then uses language
 * that fits every creator and never guesses a profession.
 */
import type { CreatorType } from '@/types/db';

export const SEGMENTS = [
  'musician',
  'dj_producer',
  'comedian',
  'athlete',
  'actor_model',
  'podcaster',
  'streamer',
  'writer',
  'other',
] as const;

export type Segment = (typeof SEGMENTS)[number];

/** The segment value used when we do not know (or the person is "other"). */
export const NEUTRAL_SEGMENT = 'neutral' as const;
export type ResolvedSegment = Segment | typeof NEUTRAL_SEGMENT;

/** Minimum confidence at which an inferred segment is acted on. */
export const SEGMENT_CONFIDENCE_THRESHOLD = 0.6;

/** Segments whose members make and release music. */
export const MUSIC_SEGMENTS: readonly Segment[] = ['musician', 'dj_producer'];

export function isSegment(value: unknown): value is Segment {
  return (
    typeof value === 'string' && (SEGMENTS as readonly string[]).includes(value)
  );
}

export function isMusicSegment(segment: ResolvedSegment): boolean {
  return (MUSIC_SEGMENTS as readonly string[]).includes(segment);
}

export const SEGMENT_LABELS: Record<Segment, string> = {
  musician: 'Musician',
  dj_producer: 'DJ or producer',
  comedian: 'Comedian',
  athlete: 'Athlete or fitness',
  actor_model: 'Actor or model',
  podcaster: 'Podcaster',
  streamer: 'YouTuber or streamer',
  writer: 'Writer',
  other: 'Other',
};

export interface SegmentSignals {
  /** The coarse DB enum value. */
  creatorType?: CreatorType | null;
  /** Platform ids of connected or detected links (spotify, twitch, ...). */
  platforms?: readonly string[];
  /** True when the profile has a music catalog (releases, DSP ids). */
  hasMusicCatalog?: boolean;
  bio?: string | null;
  /** Free text from onboarding ("what are you working on?"). */
  onboardingAnswer?: string | null;
  /** Explicit value from `settings.segment`. Always wins. */
  explicit?: unknown;
}

export interface SegmentInference {
  segment: ResolvedSegment;
  /** 0..1. 1 only for an explicit choice. */
  confidence: number;
  /** Highest-scoring segment even when below threshold (diagnostics only). */
  candidate: Segment | null;
  source: 'explicit' | 'inferred' | 'none';
}

const NEUTRAL_RESULT: SegmentInference = {
  segment: NEUTRAL_SEGMENT,
  confidence: 0,
  candidate: null,
  source: 'none',
};

type Score = Record<Segment, number>;

const KEYWORDS: Record<Exclude<Segment, 'other'>, RegExp> = {
  musician:
    /\b(singer|songwriter|rapper|guitarist|drummer|band|vocalist|musician|singer-songwriter|new (single|album|ep)|record label)\b/i,
  dj_producer:
    /\b(dj|d\.j\.|producer|beatmaker|beat ?maker|techno|house music|resident|remix(er)?)\b/i,
  comedian:
    /\b(comedian|comic|stand-?up|standup|improv|sketch|open mic|comedy)\b/i,
  athlete:
    /\b(athlete|trainer|coach|fitness|crossfit|marathon|runner|boxer|mma|swimmer|bodybuilder|lifter|olympian)\b/i,
  actor_model:
    /\b(actor|actress|model|modeling|modelling|casting|screen ?actor|voice actor)\b/i,
  podcaster: /\b(podcast(er)?|podcasting|host of|my show)\b/i,
  streamer:
    /\b(youtuber|streamer|twitch|live ?stream|gaming channel|vlogger)\b/i,
  writer:
    /\b(writer|author|novelist|poet|journalist|newsletter|columnist|screenwriter)\b/i,
};

const PLATFORM_WEIGHTS: Record<string, Partial<Score>> = {
  spotify: { musician: 0.35, dj_producer: 0.15 },
  apple_music: { musician: 0.35, dj_producer: 0.15 },
  'apple-music': { musician: 0.35, dj_producer: 0.15 },
  bandcamp: { musician: 0.35 },
  tidal: { musician: 0.3 },
  deezer: { musician: 0.3 },
  soundcloud: { dj_producer: 0.3, musician: 0.15 },
  mixcloud: { dj_producer: 0.5 },
  beatport: { dj_producer: 0.6 },
  residentadvisor: { dj_producer: 0.5 },
  twitch: { streamer: 0.6 },
  youtube: { streamer: 0.3 },
  kick: { streamer: 0.5 },
  strava: { athlete: 0.6 },
  substack: { writer: 0.5 },
  medium: { writer: 0.5 },
  goodreads: { writer: 0.4 },
  imdb: { actor_model: 0.5 },
  'apple-podcasts': { podcaster: 0.6 },
  apple_podcasts: { podcaster: 0.6 },
  'spotify-podcasts': { podcaster: 0.6 },
};

function zero(): Score {
  return {
    musician: 0,
    dj_producer: 0,
    comedian: 0,
    athlete: 0,
    actor_model: 0,
    podcaster: 0,
    streamer: 0,
    writer: 0,
    other: 0,
  };
}

function add(score: Score, key: Segment, amount: number): void {
  score[key] = Math.min(1, score[key] + amount);
}

function scoreText(
  score: Score,
  text: string | null | undefined,
  weight: number
): void {
  if (!text) return;
  for (const [segment, pattern] of Object.entries(KEYWORDS) as [
    Segment,
    RegExp,
  ][]) {
    if (pattern.test(text)) add(score, segment, weight);
  }
}

/**
 * Infer a segment from available signals. Pure and deterministic.
 * Ties between the top two segments below a 0.15 margin resolve to neutral
 * (a DJ with a Spotify link is not confidently a musician or a DJ).
 */
export function inferSegment(signals: SegmentSignals): SegmentInference {
  if (isSegment(signals.explicit)) {
    return {
      segment:
        signals.explicit === 'other' ? NEUTRAL_SEGMENT : signals.explicit,
      confidence: 1,
      candidate: signals.explicit,
      source: 'explicit',
    };
  }

  const score = zero();
  if (signals.creatorType === 'artist') add(score, 'musician', 0.2);
  if (signals.creatorType === 'podcaster') add(score, 'podcaster', 0.6);
  if (signals.creatorType === 'influencer') add(score, 'streamer', 0.15);
  if (signals.hasMusicCatalog) add(score, 'musician', 0.3);
  for (const platform of signals.platforms ?? []) {
    const weights = PLATFORM_WEIGHTS[platform.toLowerCase()];
    if (!weights) continue;
    for (const [segment, amount] of Object.entries(weights) as [
      Segment,
      number,
    ][]) {
      add(score, segment, amount);
    }
  }
  // Self-described words outrank passive signals; onboarding answers are the
  // person's own words so they weigh most.
  scoreText(score, signals.bio, 0.45);
  scoreText(score, signals.onboardingAnswer, 0.8);

  const ranked = (Object.entries(score) as [Segment, number][])
    .filter(([segment, value]) => segment !== 'other' && value > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return NEUTRAL_RESULT;
  const [segment, confidence] = top;
  const runnerUp = ranked[1];
  const margin = runnerUp ? confidence - runnerUp[1] : confidence;
  if (confidence < SEGMENT_CONFIDENCE_THRESHOLD || margin < 0.15) {
    return { ...NEUTRAL_RESULT, confidence, candidate: segment };
  }
  return { segment, confidence, candidate: segment, source: 'inferred' };
}

/** Read the explicit segment out of `creator_profiles.settings`. */
export function explicitSegmentFromSettings(
  settings: Record<string, unknown> | null | undefined
): Segment | null {
  const value = settings?.segment;
  return isSegment(value) ? value : null;
}
