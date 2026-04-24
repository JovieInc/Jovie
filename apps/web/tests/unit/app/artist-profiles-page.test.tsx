import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import {
  ARTIST_PROFILE_SECTION_ORDER,
  ARTIST_PROFILE_SECTION_TEST_IDS,
} from '@/data/artistProfilePageOrder';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';

interface ChildrenProps {
  readonly children?: ReactNode;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
  usePathname: () => '/artist-profiles',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/components/marketing', () => ({
  MarketingContainer: ({ children }: ChildrenProps) => (
    <div data-testid='marketing-container'>{children}</div>
  ),
  MarketingPageShell: ({ children }: ChildrenProps) => (
    <main data-testid='marketing-page-shell'>{children}</main>
  ),
}));

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <section>Trusted by Artists</section>,
}));

vi.mock('@/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <section>Trusted by Artists</section>,
}));

vi.mock('@/components/marketing/artist-profile/ArtistProfileHero', () => ({
  ArtistProfileHero: ({
    hero,
  }: {
    readonly hero: typeof ARTIST_PROFILE_COPY.hero;
  }) => (
    <section className='homepage-hero--artist-profile'>
      <h1>{hero.headline}</h1>
      <p>{hero.subhead}</p>
      <div data-testid='homepage-claim-form'>{hero.ctaLabel}</div>
    </section>
  ),
}));

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro',
  () => ({
    ArtistProfileHeroAdaptiveIntro: ({
      hero,
      adaptive,
      phoneCaption,
      phoneSubcaption,
    }: {
      readonly hero: typeof ARTIST_PROFILE_COPY.hero;
      readonly adaptive: typeof ARTIST_PROFILE_COPY.adaptive;
      readonly phoneCaption: string;
      readonly phoneSubcaption: string;
    }) => (
      <>
        <section data-testid='artist-profile-section-hero'>
          <h1>{hero.headline}</h1>
          <div data-testid='homepage-claim-form'>{hero.ctaLabel}</div>
        </section>
        <section data-testid='artist-profile-section-adaptive'>
          <div data-testid='artist-profile-adaptive-sequence'>
            <h2>{phoneCaption}</h2>
            <p>{phoneSubcaption}</p>
            <img alt={adaptive.restingScreenshotAlt} src='/test-shot.png' />
            {adaptive.modes.map(mode => (
              <button key={mode.id} type='button'>
                {mode.label}
              </button>
            ))}
          </div>
        </section>
        <section data-testid='artist-profile-section-trust'>
          Trusted by Artists
        </section>
      </>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel',
  () => ({
    ArtistProfileOutcomesCarousel: ({
      outcomes,
    }: {
      readonly outcomes: typeof ARTIST_PROFILE_COPY.outcomes;
    }) => (
      <section>
        <h2>{outcomes.headline}</h2>
        <div data-testid='artist-profile-outcomes-grid'>
          {outcomes.cards.map(card => (
            <article key={card.id} data-testid='artist-profile-outcome-card'>
              {card.title}
            </article>
          ))}
        </div>
      </section>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileCaptureSection',
  () => ({
    ArtistProfileCaptureSection: ({
      capture,
    }: {
      readonly capture: typeof ARTIST_PROFILE_COPY.capture;
    }) => (
      <section>
        <h2>{capture.headline}</h2>
        <p>{capture.notification.title}</p>
      </section>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileReactivationSection',
  () => ({
    ArtistProfileReactivationSection: ({
      reactivation,
    }: {
      readonly reactivation: typeof ARTIST_PROFILE_COPY.reactivation;
    }) => (
      <section>
        <h2>{reactivation.headline}</h2>
        <p>{reactivation.outputs[0]?.title}</p>
      </section>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileMonetizationSection',
  () => ({
    ArtistProfileMonetizationSection: ({
      monetization,
    }: {
      readonly monetization: typeof ARTIST_PROFILE_COPY.monetization;
    }) => (
      <section>
        <h2>{monetization.headline}</h2>
        {[
          monetization.irlPaymentsCard,
          monetization.captureCard,
          monetization.thanksCard,
          monetization.reengageCard,
        ].map(card => (
          <article
            data-testid='artist-profile-monetization-card'
            key={card.title}
          >
            {card.title}
          </article>
        ))}
      </section>
    ),
  })
);

vi.mock('@/components/marketing/artist-profile/ArtistProfileSpecWall', () => ({
  ArtistProfileSpecWall: ({
    specWall,
    tiles,
  }: {
    readonly specWall: typeof ARTIST_PROFILE_COPY.specWall;
    readonly tiles: typeof ARTIST_PROFILE_SPEC_TILES;
  }) => (
    <section>
      <h2>{specWall.headline}</h2>
      {tiles.map(tile => (
        <article key={tile.title}>{tile.title}</article>
      ))}
    </section>
  ),
}));

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileHowItWorks',
  () => ({
    ArtistProfileHowItWorks: ({
      howItWorks,
    }: {
      readonly howItWorks: typeof ARTIST_PROFILE_COPY.howItWorks;
    }) => (
      <section>
        <h2>{howItWorks.headline}</h2>
        {howItWorks.steps.map(step => (
          <article key={step.id}>{step.description}</article>
        ))}
        <p>{howItWorks.sync.otherProvidersLabel}</p>
      </section>
    ),
  })
);

vi.mock(
  '@/components/marketing/artist-profile/ArtistProfileSocialProof',
  () => ({
    ArtistProfileSocialProof: ({
      socialProof,
    }: {
      readonly socialProof: typeof ARTIST_PROFILE_COPY.socialProof;
    }) => (
      <section>
        <h2>{socialProof.headline}</h2>
        <p>{socialProof.intro}</p>
      </section>
    ),
  })
);

vi.mock('@/components/marketing/artist-profile/ArtistProfileFaq', () => ({
  ArtistProfileFaq: ({
    faq,
  }: {
    readonly faq: typeof ARTIST_PROFILE_COPY.faq;
  }) => (
    <section>
      <h2>{faq.headline}</h2>
      {faq.items.map(item => (
        <article key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </article>
      ))}
    </section>
  ),
}));

vi.mock('@/components/marketing/artist-profile/ArtistProfileFinalCta', () => ({
  ArtistProfileFinalCta: ({
    finalCta,
  }: {
    readonly finalCta: typeof ARTIST_PROFILE_COPY.finalCta;
  }) => (
    <section>
      <h2 data-testid='final-cta-headline'>{finalCta.headline}</h2>
      <p>{finalCta.subhead}</p>
      <button type='button'>{finalCta.ctaLabel}</button>
    </section>
  ),
}));

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

async function renderArtistProfileLandingPage(
  flags: ArtistProfileSectionFlags
) {
  const { ArtistProfileLandingPage } = await import(
    '@/components/marketing/artist-profile'
  );

  render(
    <ArtistProfileLandingPage
      copy={ARTIST_PROFILE_COPY}
      launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
      specTiles={ARTIST_PROFILE_SPEC_TILES}
      socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
      flags={flags}
    />
  );
}

describe('ArtistProfilesPage', () => {
  it('exports the static artist-profiles SEO contract and renders through the marketing shell', async () => {
    const {
      default: ArtistProfilesPage,
      metadata,
      revalidate,
    } = await import('@/app/(marketing)/artist-profiles/page');

    expect(revalidate).toBe(false);
    expect(metadata.title).toBe(ARTIST_PROFILE_COPY.seo.title);
    expect(metadata.description).toBe(ARTIST_PROFILE_COPY.seo.description);
    expect(metadata.alternates?.canonical).toContain('/artist-profiles');

    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('marketing-page-shell')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: ARTIST_PROFILE_COPY.hero.headline })
    ).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      ARTIST_PROFILE_COPY.finalCta.headline
    );
  });

  it('renders full-page sections in the canonical data order', async () => {
    await renderArtistProfileLandingPage({
      FULL_PAGE: true,
      SOCIAL_PROOF: true,
      FAQ: true,
    });

    expectArtistProfileSectionOrder({
      FULL_PAGE: true,
      SOCIAL_PROOF: true,
      FAQ: true,
    });
    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.hero.phoneCaption,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name:
          ARTIST_PROFILE_COPY.adaptive.modes.find(mode => mode.id === 'contact')
            ?.label ?? 'Contact',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('artist-profile-outcome-card')).toHaveLength(
      ARTIST_PROFILE_COPY.outcomes.cards.length
    );
    expect(
      screen.getAllByTestId('artist-profile-monetization-card')
    ).toHaveLength(4);
    expect(screen.getByText('And 24 others.')).toBeInTheDocument();
  });

  it('omits optional social proof and FAQ sections when their flags are off', async () => {
    await renderArtistProfileLandingPage({
      FULL_PAGE: true,
      SOCIAL_PROOF: false,
      FAQ: false,
    });

    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.socialProof)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.faq)
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.finalCta)
    ).toBeInTheDocument();
  });

  it('renders only hero and trust sections when the full page flag is off', async () => {
    await renderArtistProfileLandingPage({
      FULL_PAGE: false,
      SOCIAL_PROOF: false,
      FAQ: false,
    });

    expectArtistProfileSectionOrder({
      FULL_PAGE: false,
      SOCIAL_PROOF: false,
      FAQ: false,
    });
    expect(
      screen.getByText(ARTIST_PROFILE_COPY.hero.headline)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.adaptive)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(ARTIST_PROFILE_SECTION_TEST_IDS.monetization)
    ).not.toBeInTheDocument();
  });
});
