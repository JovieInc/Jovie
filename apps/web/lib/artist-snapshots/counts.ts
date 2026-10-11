/**
 * Exact counts from the YouTube Data API. Compact suffixes such as 1.2K are
 * rounded and are refused so they cannot be stored as growth.
 */
const EXACT_COUNT = /^\d+$/;
export interface YouTubePublicCounts {
  readonly precision: 'exact';
  readonly subscriberCount: number | null;
  readonly viewCount: number | null;
  readonly videoCount: number | null;
  readonly channelId: string | null;
  readonly hiddenSubscriberCount: boolean;
}
export function parseExactCount(raw: string | undefined): number | null {
  if (raw === undefined || !EXACT_COUNT.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}
export function youtubeCountsFromApiStatistics(input: {
  readonly channelId: string | null;
  readonly viewCount?: string;
  readonly subscriberCount?: string;
  readonly videoCount?: string;
  readonly hiddenSubscriberCount?: boolean;
}): YouTubePublicCounts | { readonly refused: 'not_exact' } {
  const hidden = input.hiddenSubscriberCount === true;
  const viewCount = parseExactCount(input.viewCount);
  const videoCount = parseExactCount(input.videoCount);
  const subscriberCount = hidden
    ? null
    : parseExactCount(input.subscriberCount);
  if (input.viewCount !== undefined && viewCount === null) {
    return { refused: 'not_exact' };
  }
  if (input.videoCount !== undefined && videoCount === null) {
    return { refused: 'not_exact' };
  }
  if (
    !hidden &&
    input.subscriberCount !== undefined &&
    subscriberCount === null
  ) {
    return { refused: 'not_exact' };
  }
  return {
    precision: 'exact',
    subscriberCount,
    viewCount,
    videoCount,
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
