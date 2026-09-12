import { describe, expect, it } from 'vitest';
import { buildDspFindUrl } from './dsp-find-url';

describe('buildDspFindUrl', () => {
  it('builds a provider search URL from the registry template', () => {
    expect(buildDspFindUrl('spotify', 'Take Me Over')).toBe(
      'https://open.spotify.com/search/Take%20Me%20Over'
    );
  });

  it('returns null without a query or search template', () => {
    expect(buildDspFindUrl('spotify', '   ')).toBeNull();
    expect(buildDspFindUrl('unknown_provider', 'Take Me Over')).toBeNull();
  });
});
