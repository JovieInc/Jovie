import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileReactivationSection } from './ArtistProfileReactivationSection';

const REACTIVATION = ARTIST_PROFILE_COPY.reactivation;
const NOTIFICATION = ARTIST_PROFILE_COPY.capture.notification;

describe('ArtistProfileReactivationSection certificate', () => {
  it('renders the centered header and visual axe-clean', async () => {
    const { container } = render(
      <ArtistProfileReactivationSection
        id='reactivation'
        notification={NOTIFICATION}
        reactivation={REACTIVATION}
      />
    );

    expect(
      screen.getByRole('heading', { name: REACTIVATION.headline })
    ).toBeInTheDocument();
    expect(screen.getByText(REACTIVATION.subhead)).toBeInTheDocument();
    expect(container.querySelector('section')).toHaveAttribute(
      'id',
      'reactivation'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean as a declared editorial feature split', async () => {
    const { container } = render(
      <ArtistProfileReactivationSection
        notification={NOTIFICATION}
        reactivation={REACTIVATION}
        sectionId='feature-split'
        sectionVariant='editorial'
        sectionOwner='apps/web/components/marketing/artist-profile/ArtistProfileReactivationSection.tsx'
      />
    );

    expect(
      screen.getByTestId('marketing-section-feature-split')
    ).toHaveAttribute('data-marketing-variant', 'editorial');
    await expectNoA11yViolations(container);
  });
});
