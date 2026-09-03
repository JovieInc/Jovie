import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { queryKeys } from '@/lib/queries';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

const releases = [
  {
    id: 'rel-story-1',
    title: 'Signal Bloom',
    slug: 'signal-bloom',
    releaseType: 'album',
    releaseDate: new Date('2026-08-14T00:00:00.000Z'),
    artworkUrl: null,
    totalTracks: 0,
    isExplicit: false,
    label: 'Jovie Labs',
    upc: null,
    sourceType: 'ingested',
    spotifyPopularity: 42,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    creatorProfileId: 'profile-story-1',
    artistUsername: 'signalbloom',
    artistDisplayName: 'Signal Bloom',
    artistAvatarUrl: null,
    artistUserId: 'user-story-1',
    providerCount: 0,
    missingArtwork: true,
    noProviders: true,
    noUpc: true,
    zeroTracks: true,
  },
  {
    id: 'rel-story-2',
    title: 'Late Checkout',
    slug: 'late-checkout',
    releaseType: 'single',
    releaseDate: new Date('2026-07-02T00:00:00.000Z'),
    artworkUrl: null,
    totalTracks: 1,
    isExplicit: true,
    label: 'North Pier',
    upc: '123456789012',
    sourceType: 'manual',
    spotifyPopularity: 67,
    createdAt: new Date('2026-07-04T00:00:00.000Z'),
    creatorProfileId: 'profile-story-2',
    artistUsername: 'latecheckout',
    artistDisplayName: 'Late Checkout',
    artistAvatarUrl: null,
    artistUserId: null,
    providerCount: 3,
    missingArtwork: false,
    noProviders: false,
    noUpc: false,
    zeroTracks: false,
  },
] satisfies AdminReleaseRow[];

function createStoryQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(
    queryKeys.adminReleases.list({
      sort: 'created_desc',
      search: '',
      pageSize: 20,
    }),
    { pages: [{ rows: releases, total: releases.length }], pageParams: [1] }
  );
  return client;
}

const storyQueryClient = createStoryQueryClient();

const meta = {
  title: 'Admin/Tables/Releases',
  component: AdminReleasesTableUnified,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <div className='h-160 bg-base text-primary-token'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    releases,
    pageSize: 20,
    total: releases.length,
    search: '',
    sort: 'created_desc',
  },
} satisfies Meta<typeof AdminReleasesTableUnified>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
