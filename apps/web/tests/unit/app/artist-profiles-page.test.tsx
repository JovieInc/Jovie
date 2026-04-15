import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage from '@/app/(marketing)/artist-profiles/page';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';

describe('ArtistProfilesPage', () => {
  const originalMatchMedia = globalThis.matchMedia;

  beforeAll(() => {
    // @ts-expect-error test shim
    globalThis.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  afterAll(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  it('renders the artist profile landing scaffold', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The link your music deserves.' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Built for every mode.' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'One profile can flex from release push to ticket sales to fan capture.'
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Subscribe' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Links' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'One profile. Infinite outcomes.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Capture every fan.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Built for artists.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Claim your profile' }).length
    ).toBeGreaterThan(0);
  });

  it('renders the data-driven faq and final cta copy', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('heading', { name: 'Frequently asked questions' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Claim your profile.'
    );
    expect(
      screen.getByText('Your next release deserves a better link.')
    ).toBeInTheDocument();
  });

  it('renders only the hero when full page sections are flagged off', () => {
    render(
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
        specTiles={ARTIST_PROFILE_SPEC_TILES}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={{ FULL_PAGE: false, SOCIAL_PROOF: false, FAQ: false }}
      />
    );

    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'One profile. Infinite outcomes.' })
    ).not.toBeInTheDocument();
  });
});
