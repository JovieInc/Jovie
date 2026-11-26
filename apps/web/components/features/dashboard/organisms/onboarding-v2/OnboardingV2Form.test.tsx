import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectOnboardingSpotifyArtist } from '@/app/onboarding/actions/connect-spotify';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingV2Form } from './OnboardingV2Form';

const mockPush = vi.fn();
const mockSearch = vi.fn();

const mockArtistSearch = vi.hoisted(() => ({
  clear: vi.fn(),
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
  search: vi.fn(),
  searchImmediate: vi.fn(),
  state: 'idle',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding',
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, fill, unoptimized, ...rest } = props;
    return <img alt={typeof alt === 'string' ? alt : ''} {...rest} />;
  },
}));
vi.mock('@/app/onboarding/actions/connect-spotify', () => ({
  connectOnboardingSpotifyArtist: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/app/onboarding/actions/enrich-profile', () => ({
  enrichProfileFromDsp: vi.fn().mockResolvedValue(null),
}));
vi.mock(
  '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation',
  () => ({
    useHandleValidation: () => ({
      handle: 'avery',
      handleValidation: {
        available: true,
        checking: false,
        clientValid: true,
        error: null,
        suggestions: [],
      },
      setHandleValidation: vi.fn(),
      validateHandle: vi.fn(),
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
      state: { error: null, isSubmitting: false },
    }),
  })
);
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({ ...mockArtistSearch, search: mockSearch }),
}));

const SNAPSHOT = {
  counts: { activeSocialCount: 0, dspCount: 0, releaseCount: 0 },
  dspItems: [],
  hasPendingDiscoveryJob: false,
  importState: {
    activeSocialCount: 0,
    confirmedDspCount: 0,
    hasImportedReleases: false,
    hasSpotifySelection: true,
    recordingCount: 0,
    releaseCount: 0,
    spotifyImportStatus: 'complete',
  },
  profile: {
    activeSinceYear: null,
    appleMusicConnected: false,
    avatarUrl: null,
    bio: null,
    displayName: 'Avery Stone',
    genres: null,
    hometown: null,
    id: 'profile-1',
    location: null,
    onboardingCompletedAt: null,
    username: 'avery',
  },
  readiness: {
    blockingReason: null,
    canProceedToDashboard: true,
    phase: 'ready',
  },
  releases: [],
  selectedSpotifyProfile: null,
  socialItems: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockSearch.mockClear();
  mockArtistSearch.results = [];
});

function renderForm(
  props: Partial<Parameters<typeof OnboardingV2Form>[0]> = {}
) {
  return render(
    <OnboardingV2Form
      isHydrated
      userId='user-1'
      initialDisplayName='Avery Stone'
      initialHandle='avery'
      assumeInitialHandleAvailable
      {...props}
    />
  );
}

describe('OnboardingV2Form', () => {
  it('opens on the handle step and is axe-clean', async () => {
    const { container } = renderForm();

    expect(
      await screen.findByRole('heading', { name: 'Claim your link' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the typed search text and searches as the visitor types', async () => {
    const user = userEvent.setup();
    const { container } = renderForm({
      initialProfileId: 'profile-1',
      initialResumeStep: 'spotify',
    });

    const input = await screen.findByRole('textbox', {
      name: 'Search By Artist Name Or Paste A Spotify Link',
    });
    expect(input).toHaveAttribute('data-host-drawn');
    await user.type(input, 'Avery');
    expect(input).toHaveValue('Avery');
    expect(mockSearch).toHaveBeenLastCalledWith('Avery');
    await expectNoA11yViolations(container);
  });

  it('explains a non-artist Spotify link without losing the pasted text', async () => {
    const user = userEvent.setup();
    renderForm({ initialProfileId: 'profile-1', initialResumeStep: 'spotify' });

    const input = await screen.findByRole('textbox', {
      name: 'Search By Artist Name Or Paste A Spotify Link',
    });
    await user.click(input);
    await user.paste('https://open.spotify.com/track/abc');
    expect(input).toHaveValue('https://open.spotify.com/track/abc');
    expect(await screen.findByText(/not an artist page/)).toBeInTheDocument();
  });

  it('connects the artist picked from the results', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ snapshot: SNAPSHOT, success: true }))
    );
    mockArtistSearch.results = [
      {
        followers: 1200,
        id: 'artist-1',
        imageUrl: null,
        name: 'Avery Stone',
        popularity: 40,
        url: 'https://open.spotify.com/artist/artist-1',
      },
    ];
    renderForm({ initialProfileId: 'profile-1', initialResumeStep: 'spotify' });

    await user.click(
      await screen.findByRole('button', { name: /Avery Stone/ })
    );
    await waitFor(() =>
      expect(connectOnboardingSpotifyArtist).toHaveBeenCalledWith(
        expect.objectContaining({ spotifyArtistId: 'artist-1' })
      )
    );
  });

  it('shows a retryable error when discovery fails on the DSP step', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 }))
    );
    const { container } = renderForm({
      initialProfileId: 'profile-1',
      initialResumeStep: 'dsp',
    });

    expect(
      await screen.findByText('Failed to load onboarding discovery.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
  });
});
