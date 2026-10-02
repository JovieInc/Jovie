/**
 * Parsers for public counts. They never return HTML.
 */

import { extractMetaContent } from '@/lib/ingestion/strategies/base';

const LOGGED_IN_MARKERS = [
  /"LOGGED_IN"\s*:\s*true/i,
  /"isLoggedIn"\s*:\s*true/i,
  /ds_user_id=/i,
  /"loggedIn"\s*:\s*true/i,
];

export function htmlLooksLoggedIn(html: string): boolean {
  return LOGGED_IN_MARKERS.some(marker => marker.test(html));
}

export function parseCompactCount(
  raw: string | null | undefined
): number | null {
  if (!raw) return null;
  const match =
    /([\d][\d,]*(?:\.\d+)?)\s*([KMB])?/i.exec(
      raw.replace(/subscribers?|views?|videos?|followers?|posts?/gi, ' ')
    ) ?? null;
  if (!match?.[1]) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === 'K'
      ? 1_000
      : suffix === 'M'
        ? 1_000_000
        : suffix === 'B'
          ? 1_000_000_000
          : 1;
  const value = Math.round(base * multiplier);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

export interface InstagramPublicCounts {
  readonly followerCount: number | null;
  readonly postCount: number | null;
}

export function parseInstagramOpenGraphCounts(
  html: string
): InstagramPublicCounts | { readonly refused: 'logged_in' } {
  if (htmlLooksLoggedIn(html)) return { refused: 'logged_in' };
  const description = extractMetaContent(html, 'og:description');
  return {
    followerCount: parseCompactCount(
      description?.match(/([\d][\d,.\s]*\s*[KMB]?)\s+Followers\b/i)?.[1]
    ),
    postCount: parseCompactCount(
      description?.match(/([\d][\d,.\s]*\s*[KMB]?)\s+Posts\b/i)?.[1]
    ),
  };
}

export interface YouTubePublicCounts {
  readonly subscriberCount: number | null;
  readonly viewCount: number | null;
  readonly videoCount: number | null;
  readonly subscriberCountText: string | null;
  readonly viewCountText: string | null;
  readonly videoCountText: string | null;
  readonly channelId: string | null;
  readonly hiddenSubscriberCount: boolean;
}

function readSimpleText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.simpleText === 'string' && record.simpleText.trim()) {
    return record.simpleText.trim();
  }
  if (!Array.isArray(record.runs)) return null;
  const text = record.runs
    .map(run =>
      run &&
      typeof run === 'object' &&
      typeof (run as { text?: unknown }).text === 'string'
        ? (run as { text: string }).text
        : ''
    )
    .join('')
    .trim();
  return text || null;
}

function collectCountTexts(
  node: unknown,
  found: {
    subscriberCountText?: string;
    viewCountText?: string;
    videoCountText?: string;
  },
  budget: { remaining: number }
): void {
  if (budget.remaining <= 0 || !node || typeof node !== 'object') return;
  budget.remaining -= 1;
  if (Array.isArray(node)) {
    for (const item of node) collectCountTexts(item, found, budget);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (
      (key === 'subscriberCountText' ||
        key === 'viewCountText' ||
        key === 'videoCountText') &&
      !found[key]
    ) {
      const text = readSimpleText(value);
      if (text) found[key] = text;
    }
    collectCountTexts(value, found, budget);
  }
}

function extractYtInitialData(html: string): unknown | null {
  const fromScript = html.match(
    /<script[^>]*id=["']ytInitialData["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (fromScript?.[1]) {
    try {
      return JSON.parse(fromScript[1]);
    } catch {
      return null;
    }
  }
  const assigned = html.match(/ytInitialData\s*=\s*(\{)/);
  if (!assigned || assigned.index === undefined) return null;
  const start = assigned.index + assigned[0].length - 1;
  let depth = 0;
  for (
    let index = start;
    index < html.length && index < start + 1_500_000;
    index += 1
  ) {
    const char = html[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseYouTubeLoggedOutCounts(
  html: string
): YouTubePublicCounts | { readonly refused: 'logged_in' } {
  if (htmlLooksLoggedIn(html)) return { refused: 'logged_in' };

  const found: {
    subscriberCountText?: string;
    viewCountText?: string;
    videoCountText?: string;
  } = {};
  collectCountTexts(extractYtInitialData(html), found, { remaining: 4_000 });

  const subscriberCountText =
    found.subscriberCountText ??
    html.match(
      /"subscriberCountText"\s*:\s*\{"simpleText"\s*:\s*"([^"]+)"/
    )?.[1] ??
    html.match(/([\d][\d,.]*\s*[KMB]?)\s+subscribers\b/i)?.[1] ??
    null;
  const viewCountText =
    found.viewCountText ??
    html.match(/"viewCountText"\s*:\s*\{"simpleText"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/([\d][\d,.]*\s*[KMB]?)\s+views\b/i)?.[1] ??
    null;
  const videoCountText =
    found.videoCountText ??
    html.match(/"videoCountText"\s*:\s*\{"simpleText"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/([\d][\d,.]*\s*[KMB]?)\s+videos\b/i)?.[1] ??
    null;
  const channelId =
    html.match(/"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    html.match(/"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    null;

  return {
    subscriberCount: parseCompactCount(subscriberCountText),
    viewCount: parseCompactCount(viewCountText),
    videoCount: parseCompactCount(videoCountText),
    subscriberCountText,
    viewCountText,
    videoCountText,
    channelId,
    hiddenSubscriberCount: /hiddenSubscriberCount"\s*:\s*true/.test(html),
  };
}

export function youtubeCountsFromApiStatistics(input: {
  readonly channelId: string | null;
  readonly viewCount?: string;
  readonly subscriberCount?: string;
  readonly videoCount?: string;
  readonly hiddenSubscriberCount?: boolean;
}): YouTubePublicCounts {
  const hidden = input.hiddenSubscriberCount === true;
  return {
    subscriberCount: hidden ? null : parseCompactCount(input.subscriberCount),
    viewCount: parseCompactCount(input.viewCount),
    videoCount: parseCompactCount(input.videoCount),
    subscriberCountText: hidden ? null : (input.subscriberCount ?? null),
    viewCountText: input.viewCount ?? null,
    videoCountText: input.videoCount ?? null,
    channelId: input.channelId,
    hiddenSubscriberCount: hidden,
  };
}

export function hasYouTubeCounts(counts: YouTubePublicCounts): boolean {
  return (
    counts.subscriberCount !== null ||
    counts.viewCount !== null ||
    counts.videoCount !== null
  );
}

export function hasInstagramCounts(counts: InstagramPublicCounts): boolean {
  return counts.followerCount !== null || counts.postCount !== null;
}
