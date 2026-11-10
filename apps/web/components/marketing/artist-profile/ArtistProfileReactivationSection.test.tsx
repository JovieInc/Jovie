import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileReactivationSection } from './ArtistProfileReactivationSection';

describe('ArtistProfileReactivationSection', () => {
  it('stamps an editorial feature split only when the caller declares one', () => {
    const { rerender } = render(
      <ArtistProfileReactivationSection
        notification={ARTIST_PROFILE_COPY.capture.notification}
        reactivation={ARTIST_PROFILE_COPY.reactivation}
      />
    );
    expect(screen.queryByTestId('marketing-section-feature-split')).toBeNull();

    rerender(
      <ArtistProfileReactivationSection
        notification={ARTIST_PROFILE_COPY.capture.notification}
        reactivation={ARTIST_PROFILE_COPY.reactivation}
        sectionId='feature-split'
        sectionVariant='editorial'
        sectionOwner='apps/web/components/marketing/artist-profile/ArtistProfileReactivationSection.tsx'
      />
    );
    expect(
      screen.getByTestId('marketing-section-feature-split')
    ).toHaveAttribute('data-marketing-variant', 'editorial');
  });
});

const OWN_WIDTH_CAP =
  /max-w-(?:300|315|280|4xl|6xl|linear-content)|--homepage-section-max/;

describe('single container width', () => {
  it.each([
    'components/marketing/artist-profile/ArtistProfileReactivationSection.tsx',
  ])('%s takes its width from the shared container, not its own cap', file => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(OWN_WIDTH_CAP);
  });
});
