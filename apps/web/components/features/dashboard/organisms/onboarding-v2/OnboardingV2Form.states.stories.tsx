import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingV2Form } from './OnboardingV2Form';

type FetchStub = () => Promise<Response>;

function stubDiscovery(stub: FetchStub) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return url.includes('/api/onboarding/discovery') ? stub() : original(input);
  }) as typeof fetch;
}

const SNAPSHOT_BASE = {
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
    id: 'storybook-profile',
    location: null,
    onboardingCompletedAt: null,
    username: 'averystone',
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

function snapshotResponse(overrides: Record<string, unknown> = {}) {
  return Promise.resolve(
    Response.json({
      snapshot: { ...SNAPSHOT_BASE, ...overrides },
      success: true,
    })
  );
}

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingV2Form/States',
  component: OnboardingV2Form,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
    jovie: { uncoveredProps: ['title'] },
  },
  args: {
    isHydrated: true,
    userId: 'storybook-user',
    userEmail: 'artist@example.com',
    initialDisplayName: 'Avery Stone',
    initialHandle: 'averystone',
    assumeInitialHandleAvailable: true,
    initialProfileId: 'storybook-profile',
  },
  render: args => (
    <div className='min-h-screen bg-base'>
      <OnboardingV2Form {...args} />
    </div>
  ),
} satisfies Meta<typeof OnboardingV2Form>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: discovery never answers, so the review step stays empty. */
export const LoadingDiscovery: Story = {
  args: { initialResumeStep: 'dsp' },
  beforeEach: () => {
    stubDiscovery(() => new Promise<Response>(() => {}));
  },
};

/** Empty: no DSP matches were found in this onboarding pass. */
export const EmptyDspMatches: Story = {
  args: { initialResumeStep: 'dsp' },
  beforeEach: () => {
    stubDiscovery(() => snapshotResponse());
  },
};

/** Error: the discovery request fails and Refresh stays available. */
export const ErrorDiscoveryFailed: Story = {
  args: { initialResumeStep: 'dsp' },
  beforeEach: () => {
    stubDiscovery(() => Promise.resolve(new Response('{}', { status: 500 })));
  },
};

/** Offline: the discovery request rejects and the same error shows. */
export const OfflineDiscovery: Story = {
  args: { initialResumeStep: 'social' },
  beforeEach: () => {
    stubDiscovery(() => Promise.reject(new TypeError('offline')));
  },
};

/** Partial: social suggestions arrive before any release is imported. */
export const PartialSocialOnly: Story = {
  args: { initialResumeStep: 'social' },
  beforeEach: () => {
    stubDiscovery(() =>
      snapshotResponse({
        socialItems: [
          {
            confidence: 0.9,
            id: 'social-1',
            kind: 'suggestion',
            platform: 'instagram',
            platformLabel: 'Instagram',
            source: 'discovery',
            state: 'pending',
            url: 'https://instagram.com/averystone',
            username: 'averystone',
            version: 1,
          },
        ],
      })
    );
  },
};

/** Long content: a very long release title truncates inside its panel. */
export const LongContentRelease: Story = {
  args: { initialResumeStep: 'releases' },
  beforeEach: () => {
    stubDiscovery(() =>
      snapshotResponse({
        counts: { activeSocialCount: 0, dspCount: 0, releaseCount: 1 },
        releases: [
          {
            artworkUrl: null,
            id: 'release-1',
            releaseDate: '2024-01-01',
            spotifyPopularity: 50,
            title:
              'An Extraordinarily Long Release Title That Should Truncate Inside Its Panel Without Breaking The Layout',
          },
        ],
      })
    );
  },
};

/** Permission denied: the Spotify import is blocked until ownership is verified. */
export const PermissionDeniedVerificationPending: Story = {
  args: { initialResumeStep: 'releases' },
  beforeEach: () => {
    stubDiscovery(() =>
      snapshotResponse({
        readiness: {
          blockingReason: 'spotify_import_failed',
          canProceedToDashboard: false,
          phase: 'blocked',
        },
      })
    );
  },
};

/** Right to left: the handle step under an Arabic document direction. */
export const RtlHandleStep: Story = {
  args: { initialProfileId: null, initialResumeStep: null },
  render: args => (
    <div dir='rtl' lang='ar' className='min-h-screen bg-base'>
      <OnboardingV2Form {...args} />
    </div>
  ),
};
