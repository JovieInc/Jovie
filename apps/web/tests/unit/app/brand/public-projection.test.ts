import { describe, expect, it } from 'vitest';
import {
  assertPublicMediaProjection,
  assertPublicSafeProjection,
  type PublicMediaProjection,
} from '@/lib/brand/public-projection';

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
