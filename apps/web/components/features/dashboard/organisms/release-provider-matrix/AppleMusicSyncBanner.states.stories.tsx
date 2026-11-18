import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
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

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowColumn: Decorator = Story => (
  <div className='w-full max-w-md'>
    <Story />
  </div>
);

/**
 * State coverage for the Apple Music match banner. `matches` and `isLoading`
 * are always passed, which keeps the banner's own eligibility query disabled,
 * so no story reaches the network.
 */
const meta = {
  title:
    'Dashboard/Organisms/ReleaseProviderMatrix/AppleMusicSyncBanner States',
  component: AppleMusicSyncBanner,
  parameters: { layout: 'padded' },
  decorators: [withDashboardProviders],
  args: {
    profileId: 'story-profile',
    spotifyConnected: true,
    releases,
    matches: [suggestedMatch],
    isLoading: false,
    onMatchStatusChange:
      fn<(connected: boolean, artistName: string | null) => void>(),
  },
} satisfies Meta<typeof AppleMusicSyncBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the banner stays unmounted while eligibility loads. */
export const LoadingEligibilityHidden: Story = {
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Sasha Waves')).toBeNull();
  },
};

/** Empty: a profile with no releases has nothing to match, so nothing shows. */
export const EmptyNoReleases: Story = {
  args: { releases: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Sasha Waves')).toBeNull();
  },
};

/** Partial: a suggested match without an Apple Music URL has no open link. */
export const PartialMatchWithoutArtistUrl: Story = {
  args: { matches: [{ ...suggestedMatch, externalArtistUrl: null }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sasha Waves')).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'View On Apple Music' })
    ).toBeNull();
  },
};

/** Long content: a long artist name truncates beside the two actions. */
export const LongContentArtistName: Story = {
  args: {
    matches: [{ ...suggestedMatch, externalArtistName: LONG_ARTIST_NAME }],
  },
  decorators: [withNarrowColumn],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_ARTIST_NAME)).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Confirm' })).toBeVisible();
  },
};

/** Long content, compact: the same name inside the compact pill. */
export const LongContentCompactArtistName: Story = {
  args: {
    compact: true,
    matches: [{ ...suggestedMatch, externalArtistName: LONG_ARTIST_NAME }],
  },
};

/** Right-to-left: the suggested match inside an RTL document. */
export const RtlSuggestedMatch: Story = {
  args: {
    matches: [{ ...suggestedMatch, externalArtistName: 'ساشا ويفز' }],
  },
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('ساشا ويفز')).toBeVisible();
  },
};
