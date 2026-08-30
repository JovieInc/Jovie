import { describe, expect, it } from 'vitest';
import { YOUTUBE_OAUTH_SCOPE_STRING, YOUTUBE_OAUTH_SCOPES } from './scopes';

describe('YouTube connector scopes', () => {
  it('preserves thumbnail updates while adding read-only analytics', () => {
    expect(YOUTUBE_OAUTH_SCOPES).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ]);
    expect(YOUTUBE_OAUTH_SCOPE_STRING.split(' ')).toEqual(YOUTUBE_OAUTH_SCOPES);
  });
});
