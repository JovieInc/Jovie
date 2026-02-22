import { describe, expect, it } from 'vitest';
import { resolvePreferredProviderKey } from './preferred-dsp';

describe('resolvePreferredProviderKey', () => {
  const links = [
    { providerId: 'spotify', url: 'https://open.spotify.com/track/1' },
    { providerId: 'apple_music', url: 'https://music.apple.com/album/1' },
  ];

  it('returns null when preference is missing', () => {
    expect(resolvePreferredProviderKey(undefined, links)).toBeNull();
  });

  it('returns null when provider is not available on content', () => {
    expect(resolvePreferredProviderKey('youtube', links)).toBeNull();
  });

  it('returns provider key when preference matches available provider', () => {
    expect(resolvePreferredProviderKey('spotify', links)).toBe('spotify');
  });
});
