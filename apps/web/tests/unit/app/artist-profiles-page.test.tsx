import { fireEvent, render, screen } from '@testing-library/react';
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
      matches: true,
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
      screen.getByRole('heading', { name: 'One profile.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Adapts to every fan.')).toBeInTheDocument();
    expect(
      screen.getByTestId('artist-profile-adaptive-sequence')
    ).toBeInTheDocument();
    expect(screen.getByText('Source-aware')).toBeInTheDocument();
    expect(screen.getByText('Location-aware')).toBeInTheDocument();
    expect(screen.getByText('Device-aware')).toBeInTheDocument();
    expect(screen.getByText('Release-aware')).toBeInTheDocument();
    expect(screen.getByText('/music')).toBeInTheDocument();
    expect(screen.getByText('/shows')).toBeInTheDocument();
    expect(screen.getByText('/pay')).toBeInTheDocument();
    expect(screen.getByText('/subscribe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(screen.getByText('Make support one tap away.')).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Jovie artist profile showing direct support options.'
      )
    ).toBeInTheDocument();
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
      screen.getAllByRole('heading', { name: 'Live in 60 seconds.' })
    ).toHaveLength(1);
    expect(
      screen.getByText(
        'Claim your artist. Jovie builds the page. Share one link everywhere.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Search once and claim the profile.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'It imports your catalog across 27+ providers and keeps the profile current.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Use it in bio, stories, QR, release posts, and shows.')
    ).toBeInTheDocument();
    expect(screen.getByText('Artist profile found')).toBeInTheDocument();
    expect(screen.getByText('Importing catalog')).toBeInTheDocument();
    expect(screen.getAllByText('jov.ie/timwhite').length).toBeGreaterThan(0);
    expect(screen.getByText('Dedicated release pages')).toBeInTheDocument();
    expect(screen.queryByText('Polished by default')).not.toBeInTheDocument();
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

  it('keeps only one artist profile faq item open at a time', () => {
    render(<ArtistProfilesPage />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'How is Jovie different from Linktree?',
      })
    );
    expect(
      screen.getByText(
        'Linktree is a general-purpose link list. Jovie is a music profile that understands releases, shows, pay, fan capture, and the actions artists need fans to take.'
      )
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'How is it different from a smart link or pre-save page?',
      })
    );
    expect(
      screen.getByText(
        'Linktree is a general-purpose link list. Jovie is a music profile that understands releases, shows, pay, fan capture, and the actions artists need fans to take.'
      )
    ).not.toBeVisible();
    expect(
      screen.getByText(
        'A smart link or pre-save page usually serves one campaign. Jovie gives the artist one profile that can route to music, shows, pay, subscribe, releases, and future fan actions.'
      )
    ).toBeVisible();
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
