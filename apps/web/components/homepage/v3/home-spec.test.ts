import { describe, expect, it } from 'vitest';
import { DSP_REGISTRY, STREAMING_DSP_KEYS } from '@/lib/dsp-registry';
import {
  dspGlyph,
  HOME_SPEC,
  RELEASE_PAGE_SERVICES,
  ROW_SERVICES,
} from './home-spec';

describe('homepage v3 spec numbers', () => {
  it('derives every count from the DSP registry, never a literal', () => {
    expect(HOME_SPEC.listen).toBe(STREAMING_DSP_KEYS.length);
    expect(HOME_SPEC.recognised).toBe(DSP_REGISTRY.length);
    expect(HOME_SPEC.listen).toBeLessThanOrEqual(HOME_SPEC.recognised);
    expect(HOME_SPEC.shownServices).toBe(RELEASE_PAGE_SERVICES.length);
  });

  it('draws registry logos as path data in their brand colour', () => {
    const spotify = dspGlyph('spotify');
    const entry = DSP_REGISTRY.find(item => item.key === 'spotify');
    expect(spotify.name).toBe(entry?.name);
    expect(spotify.color).toBe(entry?.color);
    expect(entry?.logoSvg).toContain(spotify.path);
    expect(spotify.viewBox).toBe('0 0 24 24');
    expect(ROW_SERVICES.map(glyph => glyph.key)).toEqual([
      'spotify',
      'apple_music',
      'youtube_music',
    ]);
  });

  it('fails loudly for a service the registry does not know', () => {
    expect(() => dspGlyph('not-a-service')).toThrow(/Unknown DSP key/);
  });
});
