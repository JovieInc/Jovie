import { cleanup, render, screen, within } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';
import { OnboardingPlanOffer } from '@/components/features/dashboard/organisms/onboarding-v2/OnboardingPlanOffer';
import { OnboardingV2Form } from '@/components/features/dashboard/organisms/onboarding-v2/OnboardingV2Form';
import { MARKETING_PRICING_PLANS } from '@/data/marketingPricingPlans';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import type { ArtistSearchState } from '@/lib/queries/useArtistSearchQuery';
import { formatAmount } from '@/lib/utils/format-number';

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearch = vi.fn();
const mockClear = vi.fn();
const mockSetHandleValidation = vi.fn();
const mockValidateHandle = vi.fn();
const mockTrack = vi.fn();

const mockArtistSearch = {
  clear: mockClear,
  error: null,
  isPending: false,
  query: '',
  results: [] as Array<{
    followers: number;
    id: string;
    imageUrl: string | null;
    name: string;
    popularity: number;
    url: string;
  }>,
  search: mockSearch,
  searchImmediate: mockSearch,
  state: 'idle' as ArtistSearchState,
};

const DISCOVERY_SNAPSHOT = {
  counts: {
    activeSocialCount: 2,
    dspCount: 2,
    releaseCount: 3,
  },
  dspItems: [
    {
      confidenceScore: 0.92,
      externalArtistId: 'spotify-artist-id',
      externalArtistImageUrl: null,
      externalArtistName: 'Search Budget Artist',
      externalArtistUrl: 'https://open.spotify.com/artist/spotify-artist-id',
      id: 'dsp-spotify',
      providerId: 'spotify',
      providerLabel: 'Spotify',
      status: 'suggested',
    },
  ],
  hasPendingDiscoveryJob: false,
  importState: {
    activeSocialCount: 2,
    confirmedDspCount: 1,
    hasImportedReleases: true,
    hasSpotifySelection: true,
    recordingCount: 8,
    releaseCount: 3,
    spotifyImportStatus: 'complete',
  },
  profile: {
    activeSinceYear: 2024,
    appleMusicConnected: false,
    avatarUrl: null,
    bio: 'Independent artist.',
    displayName: 'Search Budget Artist',
    genres: ['pop'],
    hometown: 'Nashville',
    id: 'profile-performance',
    location: 'Tennessee',
    onboardingCompletedAt: null,
    username: 'perf-budget',
  },
  readiness: {
    blockingReason: null as string | null,
    canProceedToDashboard: true,
    phase: 'ready',
  },
  releases: [
    {
      artworkUrl: null,
      id: 'release-1',
      releaseDate: '2024-01-01',
      spotifyPopularity: 82,
      title: 'Lead Single',
    },
  ],
  selectedSpotifyProfile: {
    id: 'spotify-artist-id',
    imageUrl: null,
    name: 'Search Budget Artist',
    url: 'https://open.spotify.com/artist/spotify-artist-id',
  },
  socialItems: [
    {
      confidence: 0.88,
      id: 'social-instagram',
      kind: 'suggestion',
      platform: 'instagram',
      platformLabel: 'Instagram',
      source: 'discovery',
      state: 'pending',
      url: 'https://instagram.com/perf-budget',
      username: 'perf-budget',
      version: 1,
    },
  ],
};

type DiscoverySnapshotFixture = typeof DISCOVERY_SNAPSHOT;
/** Nested sections merge field-by-field; arrays replace wholesale. */
type DiscoverySnapshotOverrides = {
  [K in keyof DiscoverySnapshotFixture]?: DiscoverySnapshotFixture[K] extends readonly unknown[]
    ? DiscoverySnapshotFixture[K]
    : DiscoverySnapshotFixture[K] extends object
      ? Partial<DiscoverySnapshotFixture[K]>
      : DiscoverySnapshotFixture[K];
};

function createDiscoverySnapshot(overrides: DiscoverySnapshotOverrides = {}) {
  const releaseCount =
    overrides.importState?.releaseCount ??
    overrides.counts?.releaseCount ??
    DISCOVERY_SNAPSHOT.counts.releaseCount;
  const activeSocialCount =
    overrides.importState?.activeSocialCount ??
    overrides.counts?.activeSocialCount ??
    DISCOVERY_SNAPSHOT.counts.activeSocialCount;
  const hasImportedReleases =
    overrides.importState?.hasImportedReleases ?? releaseCount > 0;

  return {
    ...DISCOVERY_SNAPSHOT,
    ...overrides,
    counts: {
      ...DISCOVERY_SNAPSHOT.counts,
      ...overrides.counts,
      activeSocialCount,
      releaseCount,
    },
    importState: {
      ...DISCOVERY_SNAPSHOT.importState,
      ...overrides.importState,
      activeSocialCount,
      hasImportedReleases,
      releaseCount,
    },
    profile: {
      ...DISCOVERY_SNAPSHOT.profile,
      ...overrides.profile,
    },
    readiness: {
      ...DISCOVERY_SNAPSHOT.readiness,
      ...overrides.readiness,
    },
  };
}

function mockDiscoveryResponse(
  snapshot: ReturnType<
    typeof createDiscoverySnapshot
  > = createDiscoverySnapshot()
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (!url.includes('/api/onboarding/discovery')) {
        throw new Error(`Unexpected fetch to: ${url}`);
      }

      return new Response(JSON.stringify({ snapshot, success: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    })
  );
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/checkout',
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, fill, unoptimized, ...rest } = props;
    return <img alt={typeof alt === 'string' ? alt : ''} {...rest} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();

  return {
    ...actual,
    Button: ({
      asChild,
      children,
      ...rest
    }: {
      asChild?: boolean;
      children: ReactNode;
    }) => <button {...rest}>{children}</button>,
    Spinner: () => <div data-testid='loading-spinner' />,
  };
});

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({
    as: Component = 'div',
    children,
    ...rest
  }: {
    as?: ElementType;
    children: ReactNode;
  }) => <Component {...rest}>{children}</Component>,
  contentSurfaceCardVariants: () => '',
}));

vi.mock('@/features/auth', () => ({
  AuthBackButton: ({
    ariaLabel,
    onClick,
  }: {
    ariaLabel: string;
    onClick?: () => void;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} type='button'>
      Back
    </button>
  ),
}));

vi.mock('@/app/onboarding/actions/connect-spotify', () => ({
  connectOnboardingSpotifyArtist: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/onboarding/actions/upgrade-offer', () => ({
  recordOnboardingUpgradeOfferDecision: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app/onboarding/actions/enrich-profile', () => ({
  enrichProfileFromDsp: vi.fn().mockResolvedValue(null),
}));

vi.mock(
  '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation',
  () => ({
    useHandleValidation: () => ({
      handle: 'perf-budget',
      handleValidation: {
        available: true,
        checking: false,
        clientValid: true,
        error: null,
        suggestions: [],
      },
      setHandleValidation: mockSetHandleValidation,
      validateHandle: mockValidateHandle,
    }),
  })
);

vi.mock(
  '@/features/dashboard/organisms/onboarding-v2/shared/useOnboardingSubmit',
  () => ({
    extractSignupClaimArtistSelection: () => null,
    useOnboardingSubmit: () => ({
      autoSubmitClaimed: false,
      handleSubmit: vi.fn(),
      isConnecting: false,
      isEnriching: false,
      isPendingSubmit: false,
      state: {
        error: null,
        isSubmitting: false,
      },
    }),
  })
);

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => mockArtistSearch,
}));

beforeEach(() => mockDiscoveryResponse());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Paid offer consistency', () => {
  it('shows the pricing feature list and monthly price on Plan and checkout', async () => {
    const offer = ARTIST_VISIBILITY_OFFER.pro;
    const features = MARKETING_PRICING_PLANS.find(
      plan => plan.id === 'pro'
    )!.features;
    render(<OnboardingPlanOffer />);
    expect(
      within(screen.getByRole('list', { name: offer.displayName }))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(features);
    cleanup();
    render(
      <OnboardingV2Form
        initialDisplayName='Test Artist'
        initialHandle='test-artist'
        initialProfileId='profile-performance'
        initialResumeStep='upgrade'
        isHydrated
        userEmail='artist@example.com'
        userId='user-performance'
      />
    );
    await screen.findByRole('heading', {
      name: 'Want the full profile from day one?',
    });
    expect(
      within(screen.getByRole('list', { name: offer.displayName }))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(features);
    expect(
      screen.getByText(`${formatAmount(toCents(offer.monthlyUsd))}/mo`)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Your import is ready/)).toHaveLength(1);
    expect(
      screen.queryByText(/album art, pitch tools, and advanced AI/)
    ).not.toBeInTheDocument();
    cleanup();
    render(
      <OnboardingCheckoutClient
        plan='pro'
        profileId={null}
        monthlyPriceId='price_test_monthly'
        annualPriceId={null}
        monthlyAmount={toCents(offer.monthlyUsd)}
        annualAmount={null}
        displayName='Test Artist'
        username='test-artist'
        avatarUrl={null}
        spotifyFollowers={null}
        isDefaultUpsell
      />
    );
    expect(
      within(screen.getByRole('list', { name: offer.displayName }))
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(features);
    expect(
      screen.getByText(formatAmount(toCents(offer.monthlyUsd)))
    ).toBeInTheDocument();
    expect(screen.getByText('/mo')).toBeInTheDocument();
    expect(screen.queryByText('Verified Badge')).not.toBeInTheDocument();
    expect(screen.queryByText(/day Analytics/)).not.toBeInTheDocument();
  });
});
