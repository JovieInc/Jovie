import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import type { TranscriptSegment } from './types';

const CAPTION_FETCH_TIMEOUT_MS = 10_000;
const FIRST_30S_WINDOW = 30;

export type TranscriptSource = 'provided' | 'captions' | 'asr' | 'none';

export interface TranscriptFetchResult {
  readonly segments: readonly TranscriptSegment[];
  readonly source: TranscriptSource;
}

interface CaptionTrackRef {
  readonly baseUrl: string;
  readonly languageCode: string;
}

/** Parse WebVTT caption text into timed segments. */
export function parseWebVtt(vtt: string): TranscriptSegment[] {
  const lines = vtt.replace(/\r\n/g, '\n').split('\n');
  const segments: TranscriptSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]?.trim() ?? '';

    if (!line || line === 'WEBVTT' || line.startsWith('NOTE')) {
      i += 1;
      continue;
    }

    if (/^\d+$/.test(line)) {
      i += 1;
      continue;
    }

    const timingMatch =
      /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/.exec(line);
    if (!timingMatch) {
      i += 1;
      continue;
    }

    const startSeconds = parseVttTimestamp(timingMatch[1]);
    const endSeconds = parseVttTimestamp(timingMatch[2]);
    i += 1;

    const textLines: string[] = [];
    while (i < lines.length) {
      const textLine = lines[i]?.trim() ?? '';
      if (!textLine) break;
      textLines.push(stripVttTags(textLine));
      i += 1;
    }

    const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;

    segments.push({
      startSeconds,
      durationSeconds: Math.max(0, endSeconds - startSeconds),
      text,
    });
  }

  return segments;
}

/** Parse YouTube JSON3 caption events into timed segments. */
export function parseJson3Captions(payload: unknown): TranscriptSegment[] {
  if (!payload || typeof payload !== 'object') return [];

  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const segments: TranscriptSegment[] = [];

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const record = event as {
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    };

    const text = (record.segs ?? [])
      .map(seg => seg.utf8 ?? '')
      .join('')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;

    const startSeconds = (record.tStartMs ?? 0) / 1000;
    const durationSeconds = (record.dDurationMs ?? 0) / 1000;

    segments.push({
      startSeconds,
      durationSeconds,
      text,
    });
  }

  return segments;
}

/** Concatenate transcript text from the first 30 seconds. */
export function extractFirst30sHookText(
  segments: readonly TranscriptSegment[]
): string {
  const hookParts: string[] = [];

  for (const segment of segments) {
    if (segment.startSeconds >= FIRST_30S_WINDOW) break;

    const text = segment.text.trim();
    if (text.length > 0) {
      hookParts.push(text);
    }
  }

  return hookParts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseVttTimestamp(value: string): number {
  const [hours, minutes, seconds] = value.split(':');
  const [wholeSeconds, millis] = (seconds ?? '0').split('.');
  return (
    Number.parseInt(hours ?? '0', 10) * 3600 +
    Number.parseInt(minutes ?? '0', 10) * 60 +
    Number.parseInt(wholeSeconds ?? '0', 10) +
    Number.parseInt(millis ?? '0', 10) / 1000
  );
}

function stripVttTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').trim();
}

function pickCaptionTrack(tracks: CaptionTrackRef[]): CaptionTrackRef | null {
  if (tracks.length === 0) return null;

  const englishManual = tracks.find(
    track =>
      track.languageCode.startsWith('en') && !track.baseUrl.includes('kind=asr')
  );
  if (englishManual) return englishManual;

  const englishAsr = tracks.find(track => track.languageCode.startsWith('en'));
  if (englishAsr) return englishAsr;

  return tracks[0] ?? null;
}

function extractCaptionTracks(html: string): CaptionTrackRef[] {
  const marker = '"captionTracks":';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return [];

  const arrayStart = html.indexOf('[', markerIndex);
  if (arrayStart < 0) return [];

  let depth = 0;
  let arrayEnd = -1;
  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = i;
        break;
      }
    }
  }

  if (arrayEnd < 0) return [];

  try {
    const parsed = JSON.parse(html.slice(arrayStart, arrayEnd + 1)) as Array<{
      baseUrl?: string;
      languageCode?: string;
    }>;

    return parsed
      .filter(track => typeof track.baseUrl === 'string')
      .map(track => ({
        baseUrl: track.baseUrl as string,
        languageCode: track.languageCode ?? 'unknown',
      }));
  } catch {
    return [];
  }
}

async function fetchCaptionSegments(
  trackUrl: string
): Promise<TranscriptSegment[]> {
  const url = new URL(trackUrl);
  url.searchParams.set('fmt', 'vtt');

  const response = await serverFetch(url.toString(), {
    timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
    context: 'YouTube caption track',
  });

  if (!response.ok) {
    throw new Error(
      `Caption track fetch failed with status ${response.status}`
    );
  }

  const vtt = await response.text();
  return parseWebVtt(vtt);
}

/**
 * Fetch public YouTube captions for a video via the watch-page player payload.
 * Returns an empty segment list when captions are unavailable.
 */
export async function fetchVideoCaptions(
  videoId: string
): Promise<readonly TranscriptSegment[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const response = await serverFetch(watchUrl, {
    timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
    context: 'YouTube watch page',
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    logger.warn('[packaging-intelligence] Watch page fetch failed', {
      videoId,
      status: response.status,
    });
    return [];
  }

  const html = await response.text();
  const tracks = extractCaptionTracks(html);
  const track = pickCaptionTrack(tracks);

  if (!track) {
    logger.info('[packaging-intelligence] No caption tracks found', {
      videoId,
    });
    return [];
  }

  try {
    return await fetchCaptionSegments(track.baseUrl);
  } catch (error) {
    logger.warn('[packaging-intelligence] Caption track parse failed', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
