import { describe, expect, it } from 'vitest';
import { YOUTUBE_OAUTH_SCOPE_STRING, YOUTUBE_OAUTH_SCOPES } from './scopes';

describe('YouTube connector scopes', () => {
  it('requests only channel import and non-monetary analytics access', () => {
    expect(YOUTUBE_OAUTH_SCOPES).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ]);
    expect(YOUTUBE_OAUTH_SCOPE_STRING.split(' ')).toEqual(YOUTUBE_OAUTH_SCOPES);
  });
});
