import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import storyMeta, { Compact, Intro } from './ArtistProfileModeSwitcher.stories';

describe('ArtistProfileModeSwitcher', () => {
  it('keeps the tabbed phone-mode source contract bounded and accessible', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileModeSwitcher.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("aria-label='Profile Modes'");
    expect(source).toContain("'ap-mode-switcher__headline'");
    expect(source).toContain("'line-clamp-2'");
    expect(source).toContain("layoutId='artist-profile-mode-active-tab'");
    expect(source).toContain('useReducedMotion');
  });

  it('keeps the adjacent Storybook receipt bound to both mode-switcher layouts', () => {
    expect(storyMeta.component).toBe(ArtistProfileModeSwitcher);
    expect(Intro.args?.adaptive).toBe(ARTIST_PROFILE_COPY.adaptive);
    expect(Intro.args?.showIntroHeading).toBe(true);
    expect(Compact.args?.adaptive).toBe(ARTIST_PROFILE_COPY.adaptive);
    expect(Compact.args?.showIntroHeading).toBe(false);
  });
});
