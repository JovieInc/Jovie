import { describe, expect, it } from 'vitest';
import { JOVIE_IMAGE_COLOR_POLICY } from '@/data/marketing';
import {
  assertPublicMediaProjection,
  assertPublicSafeProjection,
  type PublicMediaProjection,
} from '@/lib/brand/public-projection';
import { PUBLIC_IMAGERY_RULES } from '@/lib/brand/public-system';

const reviewedMedia = {
  url: '/brand/editorial.jpg',
  alt: 'Artist standing on a lit stage.',
  provenance_status: 'verified',
  rights_status: 'cleared',
} satisfies PublicMediaProjection;

describe('public Brand System projection', () => {
  it('accepts only the reviewed public media fields', () => {
    expect(() => assertPublicMediaProjection(reviewedMedia)).not.toThrow();
    expect(() =>
      assertPublicMediaProjection({
        ...reviewedMedia,
        internal_name: 'campaign-option-a',
      } as PublicMediaProjection)
    ).toThrow(/not in the public projection schema/);
  });

  it('requires human-reviewed non-empty public alt text', () => {
    expect(() =>
      assertPublicMediaProjection({ ...reviewedMedia, alt: ' ' })
    ).toThrow(/human-reviewed and non-empty/);
  });

  it('projects scene-first imagery guidance from the canonical policy', () => {
    const guidance = PUBLIC_IMAGERY_RULES.join('\n');

    expect(guidance).toContain(JOVIE_IMAGE_COLOR_POLICY.invariant);
    for (const entry of JOVIE_IMAGE_COLOR_POLICY.scenePalette) {
      expect(guidance).toContain(entry.sceneReference.hex);
    }
    expect(guidance).toContain('never recolored into brand harmony');
    expect(guidance).not.toMatch(/\/Users\//);
    expect(guidance).not.toMatch(/\bJOV-\d+\b/);
  });

  it.each([
    'audience',
    'variant_selection',
    'gender',
    'age_range',
    'style_label',
    'license_detail',
    'media_rights_operational_metadata',
    'unexpected_safe_sounding_label',
  ])('fails closed for an unreviewed media field: %s', field => {
    const projection = {
      media: {
        published: [],
        public_fields: [],
        policy: {},
        [field]: 'private-value',
      },
    };

    expect(() => assertPublicSafeProjection(projection)).toThrow(
      /rejected private or unreviewed fields/
    );
  });

  it('rejects an unknown field even when its name looks harmless', () => {
    expect(() =>
      assertPublicSafeProjection({ harmless_sounding_field: 'private' })
    ).toThrow(/not in the public projection schema/);
  });
});
