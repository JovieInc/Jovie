import { describe, expect, it } from 'vitest';
import {
  profilePrimaryPillClassName,
  profileSecondaryPillClassName,
} from './shared';

function expectCanonicalCtaGeometry(className: string) {
  expect(className).toMatch(/(?:^|\s)h-7(?:\s|$)/);
  expect(className).toContain('before:h-11');
  expect(className).toContain('before:min-w-11');
  expect(className).toContain('before:w-full');
  expect(className).not.toMatch(/(?:^|\s)h-(?:11|12)(?:\s|$)/);
}

describe('public-profile CTA button contract', () => {
  it('keeps primary semantic CTAs at 28px inside a 44px target', () => {
    expectCanonicalCtaGeometry(profilePrimaryPillClassName);
  });

  it('keeps secondary semantic CTAs at 28px inside a 44px target', () => {
    expectCanonicalCtaGeometry(profileSecondaryPillClassName);
  });
});
