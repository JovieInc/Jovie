import { describe, expect, it } from 'vitest';
import {
  decodeSpotifyPreSaveState,
  encodeSpotifyPreSaveState,
} from '@/lib/pre-save/state';

describe('spotify pre-save state', () => {
  it('round-trips a valid payload', () => {
    const encoded = encodeSpotifyPreSaveState({
      releaseId: 'release-id',
      trackId: null,
      username: 'artist',
      slug: 'new-single',
    });

    const decoded = decodeSpotifyPreSaveState(encoded);

    expect(decoded.releaseId).toBe('release-id');
    expect(decoded.username).toBe('artist');
  });

  it('rejects tampered state', () => {
    const encoded = encodeSpotifyPreSaveState({
      releaseId: 'release-id',
      trackId: null,
      username: 'artist',
      slug: 'new-single',
    });

    const tampered = `${encoded}tampered`;

    expect(() => decodeSpotifyPreSaveState(tampered)).toThrow();
  });
});
