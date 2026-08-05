import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLIC_HERO_OBJECT_POSITION,
  readPublicHeroFocalY,
  resolvePublicHeroObjectPosition,
} from '@/lib/profile/public-hero-media';

describe('public hero media crop contract', () => {
  it.each([
    ['high', '50% 20%'],
    ['center', '50% 50%'],
    ['low', '50% 80%'],
  ] as const)('maps the manual %s fixture to a safe crop', (focalY, expected) => {
    const settings = { publicHeroMedia: { focalY } };

    expect(readPublicHeroFocalY(settings)).toBe(focalY);
    expect(resolvePublicHeroObjectPosition(settings)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    {},
    { publicHeroMedia: null },
    { publicHeroMedia: { focalY: 'bottom' } },
    { publicHeroMedia: { focalY: 'url(https://example.test)' } },
    { publicHeroMedia: { focalY: '50% 100%' } },
  ])('uses the deterministic default for missing or malformed metadata', settings => {
    expect(readPublicHeroFocalY(settings)).toBeNull();
    expect(resolvePublicHeroObjectPosition(settings)).toBe(
      DEFAULT_PUBLIC_HERO_OBJECT_POSITION
    );
  });
});
