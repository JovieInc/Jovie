import { describe, expect, it } from 'vitest';
import { YOUTUBE_OAUTH_SCOPE_STRING, YOUTUBE_OAUTH_SCOPES } from './scopes';

describe('YouTube connector scopes', () => {
  it('preserves thumbnails/analytics while adding approved comment replies', () => {
    expect(YOUTUBE_OAUTH_SCOPES).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ]);
    expect(YOUTUBE_OAUTH_SCOPE_STRING.split(' ')).toEqual(YOUTUBE_OAUTH_SCOPES);
  });
});
