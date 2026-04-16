import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage from '@/app/(marketing)/artist-profiles/page';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile';
import { getAudienceRailAccentIndex } from '@/components/marketing/artist-profile/ArtistProfileCaptureSection';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SECTION_ORDER } from '@/data/artistProfilePageOrder';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

function getEnabledSectionTestIds(flags: ArtistProfileSectionFlags) {
  if (!flags.FULL_PAGE) {
    return ARTIST_PROFILE_SECTION_ORDER.filter(section =>
      ['hero', 'trust'].includes(section.id)
    ).map(section => section.testId);
  }

  return ARTIST_PROFILE_SECTION_ORDER.filter(
    section => !section.enabledByFlag || flags[section.enabledByFlag]
  ).map(section => section.testId);
}

function expectArtistProfileSectionOrder(flags: ArtistProfileSectionFlags) {
  const sectionTestIds = getEnabledSectionTestIds(flags);

  for (const testId of sectionTestIds) {
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  }

  for (let index = 0; index < sectionTestIds.length - 1; index += 1) {
    const current = screen.getByTestId(sectionTestIds[index]);
    const next = screen.getByTestId(sectionTestIds[index + 1]);

    expect(
      Boolean(
        current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  }
}

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
    expectArtistProfileSectionOrder({
      FULL_PAGE: true,
      SOCIAL_PROOF: true,
      FAQ: true,
    });

    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero')).not.toHaveClass(
      'homepage-hero--f'
    );
    expect(screen.getByTestId('homepage-hero')).toHaveClass(
      'homepage-hero--artist-profile'
    );
    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByText('Trusted by artists on')).toBeInTheDocument();
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
    const adaptiveSequence = within(
      screen.getByTestId('artist-profile-adaptive-sequence')
    );

    expect(
      adaptiveSequence.getByRole('button', { name: 'Listen' })
    ).toBeInTheDocument();
    expect(
      adaptiveSequence.getByRole('button', { name: 'Pay' })
    ).toBeInTheDocument();
    expect(
      adaptiveSequence.getByRole('button', { name: 'Tour' })
    ).toBeInTheDocument();
    expect(
      adaptiveSequence.getByRole('button', { name: 'Contact' })
    ).toBeInTheDocument();
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
    expect(screen.getByText('Intent-aware')).toBeInTheDocument();
    expect(screen.getByText('/listen')).toBeInTheDocument();
    expect(screen.getByText('/tour')).toBeInTheDocument();
    expect(screen.getByText('/pay')).toBeInTheDocument();
    expect(screen.getByText('/contact')).toBeInTheDocument();
    fireEvent.click(adaptiveSequence.getByRole('button', { name: 'Pay' }));
    expect(
      adaptiveSequence.getByText('Make support one tap away.')
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Jovie artist profile showing direct support options.'
      )
    ).toBeInTheDocument();
    const outcomesSection = within(
      screen.getByTestId('artist-profile-section-outcomes')
    );
    expect(
      outcomesSection.getByRole('heading', {
        name: 'Built for artists.',
      })
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByRole('heading', { name: 'Drive streams' })
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByRole('heading', { name: 'Sell out' })
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByRole('heading', { name: 'Get paid' })
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByRole('heading', { name: 'Share anywhere' })
    ).toBeInTheDocument();
    expect(outcomesSection.getByText('Latest release')).toBeInTheDocument();
    expect(outcomesSection.getByText('The Deep End')).toBeInTheDocument();
    expect(outcomesSection.getByText('Pre-save live')).toBeInTheDocument();
    expect(outcomesSection.getByText('Nearby date')).toBeInTheDocument();
    expect(outcomesSection.getByText('May 18')).toBeInTheDocument();
    expect(outcomesSection.getAllByText('The Novo').length).toBeGreaterThan(0);
    expect(outcomesSection.getByText('Tour Dates')).toBeInTheDocument();
    expect(
      outcomesSection.getAllByText('Continue with Venmo').length
    ).toBeGreaterThan(0);
    expect(outcomesSection.getByText('Share-ready')).toBeInTheDocument();
    expect(outcomesSection.getByText('jov.ie/tim')).toBeInTheDocument();
    expect(
      outcomesSection.getByText('Bio, QR, stories, and shows.')
    ).toBeInTheDocument();
    const monetizationSection = within(
      screen.getByTestId('artist-profile-section-monetization')
    );
    expect(
      screen.getByRole('heading', { name: 'Get paid. Keep the fan.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Get paid.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Capture the fan.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Say thanks.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Turn merch-table and QR support into a relationship you can reach again.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('QR-ready support for shows, merch tables, and bios.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Collect permission while the moment is still warm.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Turn one payment into the next listen, save, or show.')
    ).toBeInTheDocument();
    expect(monetizationSection.getByText('Merch Table QR')).toBeInTheDocument();
    expect(
      monetizationSection.getByText('Scan to support')
    ).toBeInTheDocument();
    expect(monetizationSection.getAllByText('$10').length).toBeGreaterThan(0);
    expect(monetizationSection.getAllByText('Paid').length).toBeGreaterThan(0);
    expect(monetizationSection.getAllByText('Email').length).toBeGreaterThan(0);
    expect(
      monetizationSection.getAllByText('Confirmed').length
    ).toBeGreaterThan(0);
    expect(
      monetizationSection.getAllByText('Notifications').length
    ).toBeGreaterThan(0);
    expect(monetizationSection.getAllByText('On').length).toBeGreaterThan(0);
    expect(monetizationSection.getAllByText('Show').length).toBeGreaterThan(0);
    expect(monetizationSection.getAllByText('Saved').length).toBeGreaterThan(0);
    expect(
      monetizationSection.getAllByText(
        "Thanks for the support tonight - here's the new song."
      ).length
    ).toBeGreaterThan(0);
    expect(
      monetizationSection.getByText('Open new single')
    ).toBeInTheDocument();
    expect(
      Boolean(
        screen
          .getByRole('heading', { name: 'Drive streams' })
          .compareDocumentPosition(
            screen.getByRole('heading', { name: 'Get paid. Keep the fan.' })
          ) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      Boolean(
        screen
          .getByRole('heading', { name: 'Get paid. Keep the fan.' })
          .compareDocumentPosition(
            screen.getByRole('heading', {
              name: 'Capture every fan.',
            })
          ) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      screen.getByRole('heading', {
        name: 'Capture every fan.',
      })
    ).toBeInTheDocument();
    const captureSection = within(
      screen.getByTestId('artist-profile-section-capture')
    );
    const howItWorksSection = within(
      screen.getByTestId('artist-profile-section-how-it-works')
    );
    expect(captureSection.getByText('ava@icloud.com')).toBeInTheDocument();
    expect(captureSection.getAllByText('Subscribed').length).toBeGreaterThan(0);
    expect(
      captureSection.getByText('Clicked through to Spotify')
    ).toBeInTheDocument();
    expect(
      captureSection.getByText('Email saved / Notifications on')
    ).toBeInTheDocument();
    expect(
      captureSection.getAllByText('Jason in LA clicked through to Spotify.')
        .length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Brian M subscribed by email.').length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Mika in Berlin scanned the flyer.').length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Kenji in Tokyo opened the release page.')
        .length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Amelia in London checked out your Spotify.')
        .length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Maya enabled notifications.').length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Diego paid with Apple Pay.').length
    ).toBeGreaterThan(0);
    expect(captureSection.queryByText('Get updates')).not.toBeInTheDocument();
    expect(
      captureSection.queryByText('Release and show alerts.')
    ).not.toBeInTheDocument();
    expect(captureSection.queryByText('Jason')).not.toBeInTheDocument();
    expect(captureSection.queryByText('Spotify')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { name: 'Live in 60 seconds.' })
    ).toHaveLength(1);
    expect(screen.getByText('Claim. Sync. Share.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claim' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sync' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByText('Spotify artist')).toBeInTheDocument();
    expect(screen.getByText('Importing')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('27+ providers')).toBeInTheDocument();
    expect(
      howItWorksSection.getAllByText('jov.ie/timwhite').length
    ).toBeGreaterThan(0);
    expect(howItWorksSection.getByText('Copy')).toBeInTheDocument();
    expect(howItWorksSection.getByText('Bio')).toBeInTheDocument();
    expect(howItWorksSection.getByText('Stories')).toBeInTheDocument();
    expect(howItWorksSection.getByText('QR')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Claim your artist. Jovie builds the page. Share one link everywhere.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Spotify / LA / Release page')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Jason in LA listened on Spotify.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Kenji in Tokyo opened the latest release.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Search once and claim the profile.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'It imports your catalog across 27+ providers and keeps the profile current.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Use it in bio, stories, QR, release posts, and shows.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Share-ready profile')).not.toBeInTheDocument();
    expect(
      outcomesSection.getByText(
        'Use one clean profile link across bio, QR, posts, stories, and shows.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Release moment')).toBeInTheDocument();
    expect(screen.getByText('Music first')).toBeInTheDocument();
    expect(screen.getByText('Nearby show')).toBeInTheDocument();
    expect(screen.getByText('Tickets first')).toBeInTheDocument();
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

    expectArtistProfileSectionOrder({
      FULL_PAGE: false,
      SOCIAL_PROOF: false,
      FAQ: false,
    });
    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-hero')).not.toHaveClass(
      'homepage-hero--f'
    );
    expect(screen.getByTestId('homepage-hero')).toHaveClass(
      'homepage-hero--artist-profile'
    );
    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Listen' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Drive streams' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Get paid. Keep the fan.' })
    ).not.toBeInTheDocument();
  });

  it('staggers capture rail accent colors across visible rows', () => {
    for (let pillIndex = 0; pillIndex < 8; pillIndex += 1) {
      const columnAccentIndexes = [0, 1, 2].map(railIndex =>
        getAudienceRailAccentIndex(railIndex, pillIndex)
      );

      expect(new Set(columnAccentIndexes).size).toBe(
        columnAccentIndexes.length
      );
    }
  });
});
