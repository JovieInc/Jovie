import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';
import { AppleMusicSyncBanner } from './AppleMusicSyncBanner';

const releases: ReleaseViewModel[] = [
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
  confidenceBreakdown: {
    isrcMatchScore: 0.95,
    upcMatchScore: 0.9,
    nameSimilarityScore: 0.98,
    followerRatioScore: 0.8,
    genreOverlapScore: 0.85,
  },
  matchingIsrcCount: 12,
  matchingUpcCount: 2,
  totalTracksChecked: 14,
  status: 'suggested',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/**
 * Passing both `matches` and `isLoading` explicitly (even `isLoading:
 * false`) disables the component's internal `useDspMatchesQuery` call
 * (`providedIsLoading === undefined` gates it), so these stories never hit
 * the network — no query-client seeding required beyond the provider shell
 * the confirm/reject mutations need.
 */
const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/AppleMusicSyncBanner',
  component: AppleMusicSyncBanner,
  parameters: {
    layout: 'padded',
  },
  decorators: [withDashboardProviders],
  args: {
    profileId: 'story-profile',
    spotifyConnected: true,
    releases,
    isLoading: false,
  },
} satisfies Meta<typeof AppleMusicSyncBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestedMatch: Story = {
  args: {
    matches: [suggestedMatch],
  },
};

export const NoMatch: Story = {
  args: {
    matches: [],
  },
};

export const CompactSuggested: Story = {
  args: {
    matches: [suggestedMatch],
    compact: true,
  },
};

export const CompactNoMatch: Story = {
  args: {
    matches: [],
    compact: true,
  },
};
