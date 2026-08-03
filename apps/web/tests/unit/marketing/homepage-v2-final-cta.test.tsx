import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Ctas';

describe('HomepageV2FinalCta', () => {
  it('renders the static CTA contract without decorative media', () => {
    const { container } = render(<HomepageV2FinalCta />);

    expect(screen.getByTestId('homepage-v2-final-cta')).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-final-cta-heading')
    ).toHaveTextContent('Keep your music moving.');
    expect(
      screen.getByTestId('homepage-v2-final-cta-primary')
    ).toHaveTextContent('Get started');
    expect(
      screen.queryByTestId('homepage-v2-final-cta-secondary')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-v2-final-cta-background')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-v2-final-cta-video')
    ).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('accepts a page-specific close without losing CTA analytics', () => {
    render(
      <HomepageV2FinalCta
        headline='Your next release starts here.'
        ctaLabel='Claim your artist profile'
        ctaHref='/signup?intent=claim-profile'
        sectionTestId='artist-profile-final-cta'
        headingTestId='artist-profile-final-heading'
        actionTestId='artist-profile-final-action'
        analyticsEventName='artist_profile_claim_started'
        analyticsSource='artist-profiles-final-cta'
      />
    );

    expect(screen.getByTestId('artist-profile-final-cta')).toBeInTheDocument();
    expect(
      screen.getByTestId('artist-profile-final-heading')
    ).toHaveTextContent('Your next release starts here.');
    expect(screen.getByTestId('artist-profile-final-action')).toHaveAttribute(
      'href',
      '/signup?intent=claim-profile'
    );
    expect(screen.getByTestId('artist-profile-final-action')).toHaveAttribute(
      'data-analytics-event',
      'artist_profile_claim_started'
    );
    expect(screen.getByTestId('artist-profile-final-action')).toHaveAttribute(
      'data-analytics-source',
      'artist-profiles-final-cta'
    );
  });
});
