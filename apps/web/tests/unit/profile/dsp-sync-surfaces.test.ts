import { describe, expect, it } from 'vitest';
import { getCanonicalProfileDSPs, toDSPPreferences } from '@/lib/profile-dsps';

describe('DSP surface sync', () => {
  it('returns identical DSP keys for drawer, releases table, public profile, and notification menu', () => {
    const profile: Parameters<typeof getCanonicalProfileDSPs>[0] = {
      spotify_id: 'artist-123',
      apple_music_url: 'https://music.apple.com/us/artist/example/123',
      youtube_music_id: 'UC123',
      tidal_id: '456',
    };

    const canonical = getCanonicalProfileDSPs(profile);
    const canonicalKeys = canonical.map(dsp => dsp.key);

    const drawerKeys = toDSPPreferences(canonical).map(pref => pref.key);
    const releasesTableKeys = canonical.map(dsp => dsp.key);
    const publicProfileKeys = canonical.map(dsp => dsp.key);
    const notificationMenuKeys = toDSPPreferences(canonical).map(
      pref => pref.key
    );

    expect(drawerKeys).toEqual(canonicalKeys);
    expect(releasesTableKeys).toEqual(canonicalKeys);
    expect(publicProfileKeys).toEqual(canonicalKeys);
    expect(notificationMenuKeys).toEqual(canonicalKeys);
  });
});
