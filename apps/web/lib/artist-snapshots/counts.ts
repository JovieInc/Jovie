/** Parsers for public counts. They never return HTML. */

const COMPACT_MULTIPLIERS: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

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
  const value = Math.round(
    base * (COMPACT_MULTIPLIERS[match[2]?.toUpperCase() ?? ''] ?? 1)
  );
  return Number.isSafeInteger(value) ? value : null;
}

export interface YouTubePublicCounts {
  readonly subscriberCount: number | null;
  readonly viewCount: number | null;
  readonly videoCount: number | null;
  readonly channelId: string | null;
  readonly hiddenSubscriberCount: boolean;
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
