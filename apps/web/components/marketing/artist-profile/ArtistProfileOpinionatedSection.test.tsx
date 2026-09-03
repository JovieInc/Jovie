import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
import storyMeta, { Section } from './ArtistProfileOpinionatedSection.stories';

describe('ArtistProfileOpinionatedSection', () => {
  it('keeps the opinionated profile source contract bounded and accessible', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/marketing/artist-profile/ArtistProfileOpinionatedSection.tsx'
      ),
      'utf8'
    );

    expect(source).toContain("'ap-opinionated__headline'");
    expect(source).toContain("'line-clamp-2'");
    expect(source).toContain(
      "data-testid='artist-profile-opinionated-profile'"
    );
    expect(source).toContain(
      "alt='Jovie artist profile leading with one clear Listen action.'"
    );
  });

  it('keeps the adjacent Storybook receipt bound to the production fixture', () => {
    expect(storyMeta.component).toBe(ArtistProfileOpinionatedSection);
    expect(Section.args?.opinionated).toBe(ARTIST_PROFILE_COPY.opinionated);
  });
});
