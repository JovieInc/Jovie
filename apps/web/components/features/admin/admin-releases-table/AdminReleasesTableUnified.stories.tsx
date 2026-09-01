import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';
import type { AdminReleaseRow } from '@/lib/admin/types';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const releases: AdminReleaseRow[] = [
  {
    id: 'release-1',
    title: 'First Light',
    slug: 'first-light',
    releaseType: 'single',
    releaseDate: new Date('2026-08-21T00:00:00.000Z'),
    artworkUrl: null,
    totalTracks: 1,
    isExplicit: false,
    label: 'Signal Works',
    upc: '123456789012',
    sourceType: 'manual',
    spotifyPopularity: 42,
    createdAt: new Date('2026-08-22T00:00:00.000Z'),
    creatorProfileId: 'profile-alpha',
    artistUsername: 'alpha',
    artistDisplayName: 'Alpha Artist',
    artistAvatarUrl: null,
    artistUserId: 'user-alpha',
    providerCount: 3,
    missingArtwork: true,
    noProviders: false,
    noUpc: false,
    zeroTracks: false,
  },
  {
    id: 'release-2',
    title: 'Night Routes',
    slug: 'night-routes',
    releaseType: 'ep',
    releaseDate: null,
    artworkUrl: null,
    totalTracks: 0,
    isExplicit: true,
    label: null,
    upc: null,
    sourceType: 'ingested',
    spotifyPopularity: null,
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    creatorProfileId: 'profile-beta',
    artistUsername: 'beta',
    artistDisplayName: 'Beta Artist',
    artistAvatarUrl: null,
    artistUserId: null,
    providerCount: 0,
    missingArtwork: true,
    noProviders: true,
    noUpc: true,
    zeroTracks: true,
  },
];

const meta: Meta<typeof AdminReleasesTableUnified> = {
  title: 'Admin/Releases/AdminReleasesTableUnified',
  component: AdminReleasesTableUnified,
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='h-96 p-4'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    releases,
    pageSize: 20,
    total: releases.length,
    search: '',
    sort: 'release_date_desc',
  },
};

export default meta;
type Story = StoryObj<typeof AdminReleasesTableUnified>;

export const Populated: Story = {};

export const Empty: Story = {
  args: {
    releases: [],
    total: 0,
  },
};
