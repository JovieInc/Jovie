import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const FIXTURE_PATHS = [
  'components/features/demo/demo-fixtures.ts',
  'components/features/home/featured-creators-fallback.ts',
  'components/features/home/homepage-profile-preview-fixture.ts',
] as const;

const APP_ROOT = resolve(import.meta.dirname, '../../..');

function readFixture(relativePath: string) {
  return readFileSync(resolve(APP_ROOT, relativePath), 'utf8');
}

describe('Tim White marketing fixtures', () => {
  it('uses the canonical public profile display in marketing proof labels', () => {
    expect(ARTIST_PROFILE_COPY.howItWorks.claim.profilePath).toBe(
      TIM_WHITE_PROFILE.publicProfileDisplay
    );
    expect(ARTIST_PROFILE_COPY.howItWorks.share.displayValue).toBe(
      TIM_WHITE_PROFILE.publicProfileDisplay
    );
  });
  it('scrubs fake Afterglow titles from owned marketing and demo fixtures', () => {
    for (const path of FIXTURE_PATHS) {
      const source = readFixture(path);
      expect(source).not.toContain('Afterglow (Deluxe)');
      expect(source).not.toContain('Afterglow Tour');
    }
  });

  it('does not expose the deleted Tim White draft release in profile preview fixtures', () => {
    for (const path of FIXTURE_PATHS) {
      const source = readFixture(path);
      expect(source).not.toContain("Don't Look Down");
      expect(source).not.toContain('dont-look-down');
    }
  });
});
