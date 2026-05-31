import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { decodeToolEvents } from '@/lib/chat/tool-events';
import {
  type InterviewSignal,
  interviewSignalSchema,
} from '@/lib/chat/tools/onboarding-signals';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

export interface ClaimedOnboardingArtist {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl: string | null;
  readonly followers: number | null;
  readonly popularity: number | null;
  readonly genres: readonly string[];
}

export interface ClaimedOnboardingState {
  readonly artist: ClaimedOnboardingArtist | null;
  readonly handle: string | null;
  readonly socialLinks: readonly string[];
  readonly interviewSignals: readonly InterviewSignal[];
}

export interface ClaimedOnboardingMessageRow {
  readonly toolCalls: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeSpotifyArtistUrl(url: unknown, id: string): string {
  const fallback = `https://open.spotify.com/artist/${encodeURIComponent(id)}`;
  const candidate = asString(url);
  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'open.spotify.com' &&
      parsed.pathname.startsWith('/artist/')
    ) {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function cleanHandle(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const normalized = normalizeUsername(raw.replace(/^@/, ''));
  return validateUsername(normalized).isValid ? normalized : null;
}

function readArtist(
  output: Record<string, unknown>
): ClaimedOnboardingArtist | null {
  if (output.action !== 'spotify_artist_confirmed') return null;
  const artist = isRecord(output.artist) ? output.artist : null;
  const id = asString(artist?.id) ?? asString(output.spotifyArtistId);
  const name = asString(artist?.name);
  if (!id || !name) return null;

  const genres = Array.isArray(artist?.genres)
    ? artist.genres.filter(
        (genre): genre is string =>
          typeof genre === 'string' && genre.trim().length > 0
      )
    : [];

  return {
    id,
    name,
    url: safeSpotifyArtistUrl(artist?.url, id),
    imageUrl: asString(artist?.imageUrl),
    followers: asFiniteNumber(artist?.followers),
    popularity: asFiniteNumber(artist?.popularity),
    genres,
  };
}

function readInterviewSignal(
  event: PersistedToolEvent
): InterviewSignal | null {
  if (event.toolName !== 'recordInterviewSignal') return null;

  const outputSignal = isRecord(event.output) ? event.output.signal : undefined;
  const rawSignal = outputSignal ?? event.input;
  const parsed = interviewSignalSchema.safeParse(rawSignal);
  return parsed.success ? parsed.data : null;
}

export function deriveClaimedOnboardingStateFromToolEvents(
  events: readonly PersistedToolEvent[]
): ClaimedOnboardingState {
  let artist: ClaimedOnboardingArtist | null = null;
  let handle: string | null = null;
  const socialLinks: string[] = [];
  const interviewSignals: InterviewSignal[] = [];

  for (const event of events) {
    const output = isRecord(event.output) ? event.output : null;

    if (output) {
      artist = readArtist(output) ?? artist;

      if (output.action === 'check_handle') {
        handle = cleanHandle(output.handle) ?? handle;
      }

      if (output.action === 'propose_social_link') {
        const url = asString(output.url);
        if (url) socialLinks.push(url);
      }
    }

    const signal = readInterviewSignal(event);
    if (signal) interviewSignals.push(signal);
  }

  return {
    artist,
    handle,
    socialLinks: Array.from(new Set(socialLinks)),
    interviewSignals,
  };
}

export function deriveClaimedOnboardingStateFromMessageRows(
  rows: readonly ClaimedOnboardingMessageRow[]
): ClaimedOnboardingState {
  return deriveClaimedOnboardingStateFromToolEvents(
    rows.flatMap(row => decodeToolEvents(row.toolCalls).events)
  );
}
