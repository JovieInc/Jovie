import { describe, expect, it } from 'vitest';
import { buildAudienceSourceUtmParams } from './source-route-helpers';

describe('buildAudienceSourceUtmParams', () => {
  it('preserves standard slugified values', () => {
    expect(
      buildAudienceSourceUtmParams('Tour Flyers', 'London O2 Arena')
    ).toEqual({
      source: 'qr_code',
      medium: 'print',
      campaign: 'tour-flyers',
      content: 'london-o2-arena',
    });
  });

  it('falls back to deterministic non-empty values when slugify returns empty', () => {
    const result = buildAudienceSourceUtmParams('🎉🎉🎉', '🔥🔥🔥');

    expect(result.campaign).toMatch(/^campaign-[a-z0-9]+$/);
    expect(result.content).toMatch(/^content-[a-z0-9]+$/);
    expect(result.campaign).not.toBe(result.content);
  });
});
