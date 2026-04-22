import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage from '@/app/(marketing)/artist-profiles/page';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SECTION_ORDER } from '@/data/artistProfilePageOrder';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => '/artist-profiles',
    useSearchParams: () => new URLSearchParams(),
  };
});

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

  it('renders the artist profile landing scaffold with subtraction-first copy', {
    timeout: 20_000,
  }, async () => {
    render(<ArtistProfilesPage />);

    expectArtistProfileSectionOrder({
      FULL_PAGE: true,
      SOCIAL_PROOF: true,
      FAQ: true,
    });
    expect(document.getElementById('capture-every-fan')).toBeInTheDocument();
    expect(
      document.getElementById('bring-them-back-automatically')
    ).toBeInTheDocument();

    expect(screen.getByTestId('homepage-hero')).toHaveClass(
      'homepage-hero--artist-profile'
    );
    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The link your music deserves.' })
    ).toBeInTheDocument();

    for (const bannedCopy of [
      'Owned audience',
      'Automatic reactivation',
      'Fan outcomes',
      'Power features',
      'Claim. Sync. Share.',
    ]) {
      expect(screen.queryByText(bannedCopy)).not.toBeInTheDocument();
    }

    const adaptiveSequence = within(
      screen.getByTestId('artist-profile-adaptive-sequence')
    );
    expect(
      adaptiveSequence.getByRole('heading', { name: 'One profile.' })
    ).toBeInTheDocument();
    expect(
      adaptiveSequence.getByText('Adapts to every fan.')
    ).toBeInTheDocument();
    expect(
      adaptiveSequence.getByRole('img', {
        name: ARTIST_PROFILE_COPY.adaptive.restingScreenshotAlt,
      })
    ).toBeInTheDocument();

    expect(
      adaptiveSequence.getByRole('tab', { name: 'Contact' })
    ).toBeInTheDocument();
    expect(
      ARTIST_PROFILE_COPY.adaptive.modes.find(mode => mode.id === 'contact')
        ?.screenshotAlt
    ).toContain('contact');

    expect(screen.queryByText('/listen')).not.toBeInTheDocument();
    expect(screen.queryByText('/tour')).not.toBeInTheDocument();
    expect(screen.queryByText('/pay')).not.toBeInTheDocument();
    expect(screen.queryByText('/contact')).not.toBeInTheDocument();

    const captureSection = within(
      screen.getByTestId('artist-profile-section-capture')
    );
    expect(
      captureSection.getByRole('heading', { name: 'Capture every fan.' })
    ).toBeInTheDocument();
    expect(
      captureSection.getByText('Notifications Enabled')
    ).toBeInTheDocument();
    expect(
      captureSection.getAllByText('Ava L. in London saved O2 Arena.').length
    ).toBeGreaterThan(0);
    expect(
      captureSection.getAllByText('Nina P. turned on new music notifications.')
        .length
    ).toBeGreaterThan(0);
    expect(
      captureSection.queryByText('Trusted alerts, not marketing spam.')
    ).toBe(null);

    const reactivationSection = within(
      screen.getByTestId('artist-profile-section-reactivation')
    );
    expect(
      reactivationSection.getByRole('heading', {
        name: 'Notify them automatically.',
      })
    ).toBeInTheDocument();
    expect(
      reactivationSection.getByText('Subscribers hear it first.')
    ).toBeInTheDocument();
    expect(
      reactivationSection.getByText('New release live now')
    ).toBeInTheDocument();
    expect(
      reactivationSection.queryByText('Nearby show alert')
    ).not.toBeInTheDocument();

    const monetizationSection = within(
      screen.getByTestId('artist-profile-section-monetization')
    );
    expect(
      monetizationSection.getByRole('heading', {
        name: 'Get paid. Again and again.',
      })
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText(
        'Turn a $5 busking tip into a lifelong customer.'
      )
    ).toBeInTheDocument();
    expect(
      monetizationSection.getAllByTestId('artist-profile-monetization-card')
    ).toHaveLength(4);
    for (const title of [
      'Accept payments',
      'Capture the fan',
      'Say thanks',
      'Re-engage every release',
    ]) {
      expect(
        monetizationSection.getByRole('heading', { name: title })
      ).toBeInTheDocument();
    }
    expect(monetizationSection.getByText('Jessica')).toBeInTheDocument();
    expect(monetizationSection.getByText('Los Angeles')).toBeInTheDocument();
    expect(
      monetizationSection.getByText('Sidewalk QR tip')
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText('New music notifications enabled')
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText(
        "Thanks for the payment. Here's the new song."
      )
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText(
        'A quick thank-you with the latest release, sent right after the tip.'
      )
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText('Jessica paid you $5')
    ).toBeInTheDocument();
    expect(
      monetizationSection.getByText(
        'One payment can turn into a fan who comes back again and again.'
      )
    ).toBeInTheDocument();
    expect(
      monetizationSection.queryByText('Retention loop')
    ).not.toBeInTheDocument();

    const outcomesSection = within(
      screen.getByTestId('artist-profile-section-outcomes')
    );
    expect(
      outcomesSection.getByRole('heading', { name: 'Built for Artists.' })
    ).toBeInTheDocument();
    expect(
      within(
        outcomesSection.getByTestId('artist-profile-outcomes-grid')
      ).getAllByTestId('artist-profile-outcome-card')
    ).toHaveLength(4);
    expect(
      outcomesSection.getByTestId('artist-profile-outcomes-grid')
    ).toBeInTheDocument();
    expect(outcomesSection.getAllByText('Tim White').length).toBeGreaterThan(0);
    expect(
      outcomesSection.getAllByText('w/ Cosmic Gate').length
    ).toBeGreaterThan(0);
    expect(
      outcomesSection.getByTestId('artist-profile-drive-streams-live-card')
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByTestId('artist-profile-drive-streams-presave-card')
    ).toBeInTheDocument();
    expect(
      outcomesSection.getByTestId('artist-profile-sell-out-tour-card')
    ).toBeInTheDocument();
    expect(
      outcomesSection.queryByText('Wired to my latest release')
    ).not.toBeInTheDocument();

    const specWallSection = within(
      screen.getByTestId('artist-profile-section-spec-wall')
    );
    expect(
      specWallSection.getByRole('heading', {
        name: 'Details that matter.',
      })
    ).toBeInTheDocument();
    expect(
      specWallSection.getByText(
        'Built from 15 years of music marketing experience, obsessing over the details that make a profile convert.'
      )
    ).toBeInTheDocument();
    for (const tile of ARTIST_PROFILE_SPEC_TILES) {
      expect(
        specWallSection.getByRole('heading', { name: tile.title })
      ).toBeInTheDocument();
    }
    expect(
      specWallSection.queryByText('Audience quality filtering')
    ).not.toBeInTheDocument();
    expect(
      specWallSection.queryByText('Opinionated design')
    ).not.toBeInTheDocument();
    expect(
      specWallSection.queryByText('Product philosophy')
    ).not.toBeInTheDocument();

    const howItWorksSection = within(
      screen.getByTestId('artist-profile-section-how-it-works')
    );
    expect(
      howItWorksSection.getByRole('heading', { name: 'Live in 60 seconds.' })
    ).toBeInTheDocument();
    expect(
      howItWorksSection.getByText('Find your artist.')
    ).toBeInTheDocument();
    expect(
      howItWorksSection.getByText('Pull your catalog in.')
    ).toBeInTheDocument();
    expect(
      howItWorksSection.getByText('Use the same link everywhere.')
    ).toBeInTheDocument();
    expect(howItWorksSection.getByText('And 24 others.')).toBeInTheDocument();
    expect(howItWorksSection.getAllByText('jov.ie/tim').length).toBeGreaterThan(
      0
    );

    expect(
      screen.getByRole('heading', { name: 'Real Artists. Real Workflows.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We built Jovie because we were tired of stitching/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tim White').length).toBeGreaterThan(0);
    expect(screen.getByText('Founder, Jovie')).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Claim your profile' }).length
    ).toBeGreaterThan(0);
  });

  it('renders the data-driven faq and final cta copy', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('heading', { name: 'Frequently Asked Questions' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      "Don't lose your next fan."
    );
    expect(
      screen.getByText(
        'Turn every visit into a stream, save, signup, or support.'
      )
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
    expect(screen.getByTestId('homepage-hero')).toHaveClass(
      'homepage-hero--artist-profile'
    );
    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Contact' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Get paid. Again and again.' })
    ).not.toBeInTheDocument();
  });
});
