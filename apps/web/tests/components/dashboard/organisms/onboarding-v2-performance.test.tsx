import { cleanup, render, screen } from '@testing-library/react';
import type { ElementType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingV2Form } from '@/features/dashboard/organisms/onboarding-v2/OnboardingV2Form';
import { OnboardingCheckoutClient } from '../../../../app/onboarding/checkout/OnboardingCheckoutClient';

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
  state: 'idle' as const,
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
} as const;

vi.mock('next/navigation', () => ({
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

vi.mock('@jovie/ui', () => ({
  Button: ({
    asChild,
    children,
    ...rest
  }: {
    asChild?: boolean;
    children: ReactNode;
  }) => <button {...rest}>{children}</button>,
  getInitials: (value: string) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join(''),
}));

vi.mock('@/components/atoms/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid='loading-spinner' />,
}));

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
  AuthButton: ({ children, ...rest }: { children: ReactNode }) => (
    <button {...rest}>{children}</button>
  ),
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

vi.mock('@/app/onboarding/actions/enrich-profile', () => ({
  enrichProfileFromDsp: vi.fn().mockResolvedValue(null),
}));

vi.mock(
  '@/features/dashboard/organisms/apple-style-onboarding/useHandleValidation',
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
  '@/features/dashboard/organisms/apple-style-onboarding/useOnboardingSubmit',
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

const SCREEN_BUDGETS = {
  artistConfirm: 425,
  checkout: 350,
  dsp: 180,
  handle: 200,
  lateArrivals: 500,
  profileReady: 180,
  releases: 180,
  social: 180,
  spotify: 250,
  spotifyResults: 160,
  upgrade: 150,
} as const;

beforeEach(() => {
  mockArtistSearch.results = [];
  mockArtistSearch.state = 'idle';
  mockPush.mockReset();
  mockReplace.mockReset();
  mockSearch.mockReset();
  mockClear.mockReset();
  mockSetHandleValidation.mockReset();
  mockValidateHandle.mockReset();
  mockTrack.mockReset();

  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ snapshot: DISCOVERY_SNAPSHOT, success: true }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }
        )
    )
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function measureRenderTime(
  renderView: () => void,
  heading: RegExp | string
) {
  const start = performance.now();
  renderView();
  await screen.findByRole('heading', { name: heading });
  return performance.now() - start;
}

describe('Onboarding screen performance budgets', () => {
  it.each([
    ['handle', 'Choose your handle', SCREEN_BUDGETS.handle],
    ['spotify', 'Pick your Spotify artist', SCREEN_BUDGETS.spotify],
    ['artist-confirm', 'Spotify is connected', SCREEN_BUDGETS.artistConfirm],
    ['upgrade', 'Want the full profile from day one?', SCREEN_BUDGETS.upgrade],
    ['dsp', 'Review DSP matches', SCREEN_BUDGETS.dsp],
    ['social', 'Review social links', SCREEN_BUDGETS.social],
    ['releases', 'Your release preview', SCREEN_BUDGETS.releases],
    [
      'late-arrivals',
      'A few more things showed up',
      SCREEN_BUDGETS.lateArrivals,
    ],
    ['profile-ready', 'Your profile is ready', SCREEN_BUDGETS.profileReady],
  ] as const)('%s screen renders within budget', async (initialResumeStep, heading, budgetMs) => {
    const renderTime = await measureRenderTime(
      () =>
        render(
          <OnboardingV2Form
            initialDisplayName='Perf Budget'
            initialHandle='perf-budget'
            initialProfileId='profile-performance'
            initialResumeStep={initialResumeStep}
            userEmail='perf@example.com'
            userId='user-performance'
          />
        ),
      heading
    );

    expect(renderTime).toBeLessThan(budgetMs);
  });

  it('spotify search results screen stays within budget', async () => {
    mockArtistSearch.results = [
      {
        followers: 123456,
        id: 'artist-result',
        imageUrl: null,
        name: 'Search Budget Artist',
        popularity: 81,
        url: 'https://open.spotify.com/artist/artist-result',
      },
    ];
    mockArtistSearch.state = 'success';

    const renderTime = await measureRenderTime(
      () =>
        render(
          <OnboardingV2Form
            initialDisplayName='Perf Budget'
            initialHandle='perf-budget'
            initialProfileId='profile-performance'
            initialResumeStep='spotify'
            userEmail='perf@example.com'
            userId='user-performance'
          />
        ),
      'Pick your Spotify artist'
    );

    expect(screen.getByText('Search Budget Artist')).toBeInTheDocument();
    expect(renderTime).toBeLessThan(SCREEN_BUDGETS.spotifyResults);
  });

  it('checkout screen renders within budget', async () => {
    const renderTime = await measureRenderTime(
      () =>
        render(
          <OnboardingCheckoutClient
            annualAmount={19000}
            annualPriceId='price_annual'
            avatarUrl={null}
            displayName='Perf Budget'
            isDefaultUpsell
            monthlyAmount={1900}
            monthlyPriceId='price_monthly'
            plan='pro'
            spotifyFollowers={15000}
            username='perf-budget'
          />
        ),
      /Upgrade to/i
    );

    expect(renderTime).toBeLessThan(SCREEN_BUDGETS.checkout);
  });
});
