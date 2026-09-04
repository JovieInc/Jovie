import { describe, expect, it } from 'vitest';
import {
  evaluateAcquisitionDmSend,
  evaluateYoutubeRetargetingAds,
} from './contract';
import { qualifyRegularlyUploadingChannel } from './youtube-closed-loop';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-03T18:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

describe('YouTube closed-loop ICP (JOV-5881)', () => {
  it('qualifies regularly-uploading channels and rejects sparse ones', () => {
    expect(
      qualifyRegularlyUploadingChannel({
        now,
        videos: [
          { videoId: 'a', publishedAt: daysAgo(10) },
          { videoId: 'b', publishedAt: daysAgo(40) },
          { videoId: 'c', publishedAt: daysAgo(200) },
        ],
      }).qualified
    ).toBe(true);
    expect(
      qualifyRegularlyUploadingChannel({
        now,
        videos: [
          { videoId: 'a', publishedAt: daysAgo(10) },
          { videoId: 'b', publishedAt: daysAgo(200) },
        ],
      }).reason
    ).toBe('need_more_public_videos');
    expect(
      qualifyRegularlyUploadingChannel({
        now,
        videos: [
          { videoId: 'a', publishedAt: daysAgo(10) },
          { videoId: 'b', publishedAt: daysAgo(200) },
          { videoId: 'c', publishedAt: daysAgo(210) },
        ],
      }).reason
    ).toBe('not_regularly_uploading');
  });

  it('never auto-sends outreach or arms retargeting ads', () => {
    expect(evaluateAcquisitionDmSend()).toEqual({
      allowed: false,
      reason: 'tim-only-final-send',
    });
    expect(evaluateYoutubeRetargetingAds()).toEqual({
      allowed: false,
      reason: 'ads-after-youtube-dogfood',
    });
  });
});
