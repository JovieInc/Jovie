import { describe, expect, it } from 'vitest';
import {
  hasYouTubeCounts,
  parseCompactCount,
  youtubeCountsFromApiStatistics,
} from './counts';

describe('public count parsers', () => {
  it('parses compact count text', () => {
    expect(parseCompactCount('1,234 Followers')).toBe(1234);
    expect(parseCompactCount('1.2M Followers')).toBe(1_200_000);
    expect(parseCompactCount('89 Posts')).toBe(89);
    expect(parseCompactCount('no counts')).toBeNull();
  });

  it('maps YouTube Data API statistics without hiding a public subscriber count', () => {
    const counts = youtubeCountsFromApiStatistics({
      channelId: 'UCabcdefghijklmnopqrstuv',
      subscriberCount: '10',
      viewCount: '20',
      videoCount: '3',
      hiddenSubscriberCount: false,
    });
    expect(hasYouTubeCounts(counts)).toBe(true);
    expect(counts.subscriberCount).toBe(10);

    const hidden = youtubeCountsFromApiStatistics({
      channelId: 'UCabcdefghijklmnopqrstuv',
      viewCount: '20',
      videoCount: '3',
      hiddenSubscriberCount: true,
    });
    expect(hidden.subscriberCount).toBeNull();
    expect(hidden.viewCount).toBe(20);
  });
});
