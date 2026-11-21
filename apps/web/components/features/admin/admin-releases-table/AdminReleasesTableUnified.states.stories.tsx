import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { queryKeys } from '@/lib/queries';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

const baseRelease = {
  id: 'rel-states-1',
  title: 'Signal Bloom',
  slug: 'signal-bloom',
  releaseType: 'album',
  releaseDate: new Date('2026-08-14T00:00:00.000Z'),
  artworkUrl: null,
  totalTracks: 9,
  isExplicit: false,
  label: 'Jovie Labs',
  upc: '123456789012',
  sourceType: 'ingested',
  spotifyPopularity: 42,
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  creatorProfileId: 'profile-states-1',
  artistUsername: 'signalbloom',
  artistDisplayName: 'Signal Bloom',
  artistAvatarUrl: null,
  artistUserId: 'user-states-1',
  providerCount: 3,
  missingArtwork: false,
  noProviders: false,
  noUpc: false,
  zeroTracks: false,
} satisfies AdminReleaseRow;

function clientWithRows(rows: readonly AdminReleaseRow[]) {
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
    { pages: [{ rows, total: rows.length }], pageParams: [1] }
  );
  return client;
}

const meta = {
  title: 'Admin/Tables/Releases/States',
  component: AdminReleasesTableUnified,
  parameters: { layout: 'fullscreen' },
  args: {
    releases: [baseRelease],
    pageSize: 20,
    total: 1,
    search: '',
    sort: 'created_desc',
  },
} satisfies Meta<typeof AdminReleasesTableUnified>;

export default meta;
type Story = StoryObj<typeof meta>;

function framed(rows: readonly AdminReleaseRow[], dir?: 'rtl') {
  const client = clientWithRows(rows);
  return function ReleasesStatesFrame(Story: () => React.JSX.Element) {
    return (
      <QueryClientProvider client={client}>
        <div dir={dir} className='h-160 bg-base text-primary-token'>
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

/** Empty: no release matches the search. */
export const EmptyNoReleases: Story = {
  args: { releases: [], total: 0 },
  decorators: [framed([])],
};

const longRelease = {
  ...baseRelease,
  title:
    'A very long release title that keeps going well past the width of the release column to prove truncation',
  artistDisplayName:
    'An artist with an extremely long display name that should truncate cleanly',
} satisfies AdminReleaseRow;

/** Long content: long title and artist name stay inside their cells. */
export const LongContentTitles: Story = {
  args: { releases: [longRelease], total: 1 },
  decorators: [framed([longRelease])],
};

const rtlRelease = {
  ...baseRelease,
  title: 'ضوء الصباح الأول',
  artistDisplayName: 'فنان مستقل',
} satisfies AdminReleaseRow;

/** Right-to-left: Arabic title and artist name in an RTL admin page. */
export const RtlArabicTitles: Story = {
  args: { releases: [rtlRelease], total: 1 },
  decorators: [framed([rtlRelease], 'rtl')],
};
