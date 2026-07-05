import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import type { TranscriptSegment } from './types';

const CAPTION_FETCH_TIMEOUT_MS = 10_000;
const FIRST_30S_WINDOW = 30;

export type TranscriptSource = 'provided' | 'captions' | 'asr' | 'none';

interface CaptionTrackRef {
  readonly baseUrl: string;
  readonly languageCode: string;
}

export function parseWebVtt(vtt: string): TranscriptSegment[] {
  const lines = vtt.replace(/\r\n/g, '\n').split('\n');
  const segments: TranscriptSegment[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? '';
    const timingMatch =
      /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/.exec(line);
    if (!timingMatch) continue;

    const startSeconds = parseVttTimestamp(timingMatch[1]);
    const endSeconds = parseVttTimestamp(timingMatch[2]);
    const textLines: string[] = [];

    for (i += 1; i < lines.length; i += 1) {
      const textLine = lines[i]?.trim() ?? '';
      if (!textLine || /^\d+$/.test(textLine)) {
        i -= 1;
        break;
      }
      if (/^\d{2}:\d{2}:\d{2}\.\d{3} -->/.test(textLine)) {
        i -= 1;
        break;
      }
      textLines.push(textLine.replace(/<[^>]+>/g, '').trim());
    }

    const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      segments.push({
        startSeconds,
        durationSeconds: Math.max(0, endSeconds - startSeconds),
        text,
      });
    }
  }

  return segments;
}

export function extractFirst30sHookText(
  segments: readonly TranscriptSegment[]
): string {
  return segments
    .filter(segment => segment.startSeconds < FIRST_30S_WINDOW)
    .map(segment => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function pickCaptionTrack(tracks: CaptionTrackRef[]): CaptionTrackRef | null {
  if (tracks.length === 0) return null;
  return (
    tracks.find(
      track =>
        track.languageCode.startsWith('en') &&
        !track.baseUrl.includes('kind=asr')
    ) ??
    tracks.find(track => track.languageCode.startsWith('en')) ??
    tracks[0] ??
    null
  );
}

function extractCaptionTracks(html: string): CaptionTrackRef[] {
  const markerIndex = html.indexOf('"captionTracks":');
  const arrayStart = markerIndex < 0 ? -1 : html.indexOf('[', markerIndex);
  if (arrayStart < 0) return [];

  let depth = 0;
  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i];
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(arrayStart, i + 1)) as Array<{
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
    }
  }

  return [];
}

export async function fetchVideoCaptions(
  videoId: string
): Promise<readonly TranscriptSegment[]> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const response = await serverFetch(watchUrl, {
    timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
    context: 'YouTube watch page',
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  if (!response.ok) {
    logger.warn('[packaging-intelligence] Watch page fetch failed', {
      videoId,
      status: response.status,
    });
    return [];
  }

  const track = pickCaptionTrack(extractCaptionTracks(await response.text()));
  if (!track) {
    logger.info('[packaging-intelligence] No caption tracks found', {
      videoId,
    });
    return [];
  }

  try {
    const url = new URL(track.baseUrl);
    url.searchParams.set('fmt', 'vtt');
    const captionResponse = await serverFetch(url.toString(), {
      timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
      context: 'YouTube caption track',
    });
    if (!captionResponse.ok) {
      throw new Error(
        `Caption track fetch failed with status ${captionResponse.status}`
      );
    }
    return parseWebVtt(await captionResponse.text());
  } catch (error) {
    logger.warn('[packaging-intelligence] Caption track parse failed', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
