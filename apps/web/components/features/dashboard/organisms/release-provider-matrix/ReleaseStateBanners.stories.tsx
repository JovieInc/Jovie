import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import {
  createDashboardQueryClient,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries/keys';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';
import { ReleaseStateBanners } from './ReleaseStateBanners';

const freeBilling: BillingStatusData = {
  isPro: false,
  plan: 'free',
  hasStripeCustomer: false,
  stripeSubscriptionId: null,
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

const rows: ReleaseViewModel[] = [
  {
    profileId: 'story-profile',
    id: 'release-1',
    title: 'Skyline Dreams',
    slug: 'skyline-dreams',
    status: 'released',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-01-01',
    totalTracks: 1,
    providers: [],
    spotifyPopularity: null,
    smartLinkPath: '/smart/release-1',
    previewUrl: null,
    primaryIsrc: null,
    upc: null,
  },
];

const suggestedMatch: DspMatch = {
  id: 'match-1',
  providerId: 'apple_music',
  externalArtistId: 'apple-artist-1',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/artist/sasha-waves',
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  confidenceBreakdown: null,
  matchingIsrcCount: 12,
  matchingUpcCount: 2,
  totalTracksChecked: 14,
  status: 'suggested',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const LONG_ARTIST_NAME =
  'Sasha Waves and the Extraordinarily Long Collaborative Orchestra of the Northern Coastline';

function BannerProviders({ children }: { readonly children: React.ReactNode }) {
  const queryClient = createDashboardQueryClient();
  queryClient.setQueryData(queryKeys.billing.status(), freeBilling);
  return (
    <DashboardStoryProviders queryClient={queryClient}>
      {children}
    </DashboardStoryProviders>
  );
}

const withBannerProviders: Decorator = Story => (
  <BannerProviders>
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  </BannerProviders>
);

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

/**
 * State coverage for the banner stack above the releases table. Apple Music
 * matches and their loading flag are always passed, which keeps the nested
 * banner's own query disabled, so no story reaches the network.
 */
const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/ReleaseStateBanners States',
  component: ReleaseStateBanners,
  parameters: { layout: 'padded' },
  decorators: [withBannerProviders],
  args: {
    rows,
    appleMusicMatches: [suggestedMatch],
    isAppleMusicEligibilityLoading: false,
    showImportProgress: false,
    showReleasesTable: true,
    artistName: 'Sasha Waves',
    importedCount: 0,
    totalCount: 0,
    isAppleMusicConnected: false,
    isImporting: false,
    isSpotifyConnected: true,
    isPro: false,
    canAccessFutureReleases: false,
    releasedCount: 104,
    unreleasedCount: 2,
    onAppleMusicMatchStatusChange:
      fn<(connected: boolean, name: string | null) => void>(),
  },
} satisfies Meta<typeof ReleaseStateBanners>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the import is running and Apple Music eligibility is loading. */
export const LoadingImportInProgress: Story = {
  args: {
    showImportProgress: true,
    isImporting: true,
    isAppleMusicEligibilityLoading: true,
    importedCount: 4,
    totalCount: 12,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 of 12 imported')).toBeVisible();
    await expect(
      canvas.queryByText('Confirm to link your Apple Music releases.')
    ).toBeNull();
  },
};

/** Empty: no releases and no table, so only the reserved import slot remains. */
export const EmptyNoReleases: Story = {
  args: {
    rows: [],
    showReleasesTable: false,
    releasedCount: 0,
    unreleasedCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('spotify-import-progress-banner')
    ).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas.queryByRole('complementary')).toBeNull();
  },
};

/** Partial: the artist name and import total are not known yet. */
export const PartialUnknownArtistAndTotal: Story = {
  args: {
    showImportProgress: true,
    isImporting: true,
    artistName: null,
    importedCount: 3,
    totalCount: 0,
    releasedCount: 3,
    unreleasedCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Importing releases from Spotify...')
    ).toBeVisible();
    await expect(canvas.getByText('3 imported')).toBeVisible();
  },
};

/** Long content: every banner at once with a long artist name. */
export const LongContentAllBanners: Story = {
  args: {
    showImportProgress: true,
    artistName: LONG_ARTIST_NAME,
    importedCount: 1280,
    totalCount: 4096,
    appleMusicMatches: [
      { ...suggestedMatch, externalArtistName: LONG_ARTIST_NAME },
    ],
    releasedCount: 1234567,
    unreleasedCount: 48,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('You have 1234567 smart links')
    ).toBeVisible();
    await expect(
      canvas.getByText('You have 48 upcoming releases')
    ).toBeVisible();
  },
};

/** Right-to-left: the banner stack inside an RTL document. */
export const RtlBanners: Story = {
  args: { artistName: 'ساشا ويفز' },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('complementary')
    ).toHaveLength(2);
  },
};
