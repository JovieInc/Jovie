import { describe, expect, it } from 'vitest';
import {
  hasInstagramCounts,
  hasYouTubeCounts,
  parseInstagramOpenGraphCounts,
  parseYouTubeLoggedOutCounts,
  youtubeCountsFromApiStatistics,
} from './counts';

describe('public count parsers', () => {
  it('reads Instagram follower and post counts from OpenGraph', () => {
    const counts = parseInstagramOpenGraphCounts(`
      <meta property="og:description" content="1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from Name (@name)" />
    `);
    expect(counts).toEqual({ followerCount: 1234, postCount: 78 });
    expect(
      hasInstagramCounts(counts as { followerCount: number; postCount: number })
    ).toBe(true);
  });

  it('reads compact Instagram counts', () => {
    const counts = parseInstagramOpenGraphCounts(`
      <meta property="og:description" content="1.2M Followers, 400 Following, 89 Posts" />
    `);
    expect(counts).toEqual({ followerCount: 1_200_000, postCount: 89 });
  });

  it('refuses logged-in Instagram HTML', () => {
    expect(
      parseInstagramOpenGraphCounts(
        '<meta property="og:description" content="9 Followers, 1 Posts" /> ds_user_id=1'
      )
    ).toEqual({ refused: 'logged_in' });
  });

  it('reads YouTube channel counts from logged-out page data', () => {
    const counts = parseYouTubeLoggedOutCounts(`
      <script id="ytInitialData">{"subscriberCountText":{"simpleText":"1.2M subscribers"},"viewCountText":{"simpleText":"10,000 views"},"videoCountText":{"simpleText":"42 videos"},"externalId":"UCabcdefghijklmnopqrstuv"}</script>
    `);
    expect(counts).toMatchObject({
      subscriberCount: 1_200_000,
      viewCount: 10_000,
      videoCount: 42,
      channelId: 'UCabcdefghijklmnopqrstuv',
      hiddenSubscriberCount: false,
    });
    expect(JSON.stringify(counts)).not.toContain('<script');
  });

  it('refuses logged-in YouTube HTML', () => {
    expect(
      parseYouTubeLoggedOutCounts(
        '<script id="ytInitialData">{"LOGGED_IN":true,"subscriberCountText":{"simpleText":"1 subscribers"}}</script>'
      )
    ).toEqual({ refused: 'logged_in' });
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
