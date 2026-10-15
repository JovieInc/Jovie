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
    expect(screen.getByTestId('marketing-section-feature-split')).toHaveAttribute(
      'data-marketing-variant',
      'editorial'
    );
  });
});
