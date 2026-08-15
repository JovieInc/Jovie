import { describe, expect, it } from 'vitest';
import {
  hasYouTubeThumbnailUploadScope,
  parseYouTubeChannelIdentity,
  YOUTUBE_OAUTH_SCOPE_STRING,
  YOUTUBE_OAUTH_SCOPES,
  YOUTUBE_THUMBNAIL_MAX_BYTES,
} from './scopes';

describe('youtube thumbnail connector scopes', () => {
  it('requests only channel read and video-management access', () => {
    expect(YOUTUBE_OAUTH_SCOPES).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
    ]);
    expect(YOUTUBE_OAUTH_SCOPE_STRING.split(' ')).toHaveLength(
      YOUTUBE_OAUTH_SCOPES.length
    );
  });

  it('enforces the documented 2MB thumbnail limit', () => {
    expect(YOUTUBE_THUMBNAIL_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('accepts only the dedicated thumbnail upload scope', () => {
    expect(hasYouTubeThumbnailUploadScope(YOUTUBE_OAUTH_SCOPES)).toBe(true);
    expect(
      hasYouTubeThumbnailUploadScope([
        'https://www.googleapis.com/auth/youtube.readonly',
      ])
    ).toBe(false);
  });

  it('fails closed when Google does not return a channel identity', () => {
    expect(parseYouTubeChannelIdentity({ items: [] })).toBeNull();
    expect(
      parseYouTubeChannelIdentity({ items: [{ snippet: {} }] })
    ).toBeNull();
    expect(
      parseYouTubeChannelIdentity({
        items: [{ id: 'UC123', snippet: { title: 'Creator channel' } }],
      })
    ).toEqual({ id: 'UC123', title: 'Creator channel' });
  });
});
