import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

describe('TIM_WHITE_PROFILE public handle (JOV-14240)', () => {
  it('keeps the live public handle distinct from the legacy slug', () => {
    expect(TIM_WHITE_PROFILE.publicProfileHandle).toBe('tim');
    expect(TIM_WHITE_PROFILE.publicProfileDisplay).toBe('jov.ie/tim');
    expect(TIM_WHITE_PROFILE.handle).toBe('timwhite');
  });

  it('derives the homepage ICP mock handle from publicProfileHandle', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/home/homepage-profile-preview-fixture.ts'
      ),
      'utf8'
    );
    expect(source).toContain('handle: TIM_WHITE_PROFILE.publicProfileHandle');
    expect(source).not.toMatch(/handle:\s*TIM_WHITE_PROFILE\.handle\b/);
  });

  it('keeps /solutions/artists share deep links on the live handle', () => {
    expect(ARTIST_PROFILE_COPY.howItWorks.share.url).toBe(
      TIM_WHITE_PROFILE.publicProfileUrl
    );
    expect(ARTIST_PROFILE_COPY.howItWorks.share.displayValue).toBe(
      TIM_WHITE_PROFILE.publicProfileDisplay
    );
    for (const link of ARTIST_PROFILE_COPY.howItWorks.share.deepLinks) {
      expect(link.startsWith(TIM_WHITE_PROFILE.publicProfileDisplay)).toBe(
        true
      );
      expect(link.includes('timwhite')).toBe(false);
    }
  });

  it('uses sentence case for the named /solutions/artists headings', () => {
    expect(ARTIST_PROFILE_COPY.hero.secondaryCtaLabel).toBe(
      'See how it adapts'
    );
    expect(
      ARTIST_PROFILE_COPY.specWall.callouts?.find(
        callout => callout.id === 'identity'
      )?.title
    ).toBe('They know it is you');
  });
});
