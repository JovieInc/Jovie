import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries/keys';
import { createReleaseProvider } from './release-provider';

const STORY_PROFILE_ID = 'profile-1';
const releaseMatrixKey = queryKeys.releases.matrix(STORY_PROFILE_ID);

const mockReleases = [
  {
    id: 'rel_1',
    title: 'Midnight Drive',
    artworkUrl: 'https://placehold.co/64x64',
    artistNames: ['Example Artist'],
    releaseDate: '2026-11-14',
    releaseType: 'single',
    spotifyPopularity: 42,
    totalTracks: 1,
    totalDurationMs: 214000,
  },
  {
    id: 'rel_2',
    title: 'Daylight EP',
    artworkUrl: 'https://placehold.co/64x64',
    artistNames: ['Example Artist'],
    releaseDate: '2026-08-01',
    releaseType: 'ep',
    spotifyPopularity: 30,
    totalTracks: 4,
    totalDurationMs: 720000,
  },
] as unknown as ReleaseViewModel[];

const partialReleases = [
  { id: 'rel_partial', title: 'Untitled Demo', artistNames: [] },
] as unknown as ReleaseViewModel[];

const longReleases = [
  {
    id: 'rel_long_1',
    title:
      'Midnight Drive (Extended Deluxe Anniversary Edition With Acoustic Sessions and Remixes)',
    artistNames: ['Example Artist'],
    releaseDate: '2026-11-14',
    releaseType: 'album',
  },
  {
    id: 'rel_long_2',
    title:
      'Midnight Drive Live From The Very Last Night Of The World Tour In Front Of Everyone',
    artistNames: ['Example Artist'],
    releaseDate: '2026-12-01',
    releaseType: 'single',
  },
] as unknown as ReleaseViewModel[];

const rtlReleases = [
  {
    id: 'rel_rtl_1',
    title: 'ليلة منتصف الطريق',
    artistNames: ['نور الهدى'],
    releaseDate: '2026-11-14',
    releaseType: 'single',
  },
  {
    id: 'rel_rtl_2',
    title: 'ضوء النهار',
    artistNames: ['نور الهدى'],
    releaseDate: '2026-08-01',
    releaseType: 'ep',
  },
] as unknown as ReleaseViewModel[];

function createStoryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
}

function seededClient(releases: readonly ReleaseViewModel[]) {
  const client = createStoryClient();
  client.setQueryData(releaseMatrixKey, releases);
  return client;
}

const catalogClient = seededClient(mockReleases);
const partialClient = seededClient(partialReleases);
const longClient = seededClient(longReleases);
const rtlClient = seededClient(rtlReleases);

/** The catalog request never settles, so the provider stays loading. */
const loadingClient = createStoryClient();
void loadingClient.prefetchQuery({
  queryKey: releaseMatrixKey,
  queryFn: () => new Promise<ReleaseViewModel[]>(() => {}),
});

/** The catalog request failed because the network is down. */
const offlineClient = createStoryClient();
void offlineClient.prefetchQuery({
  queryKey: releaseMatrixKey,
  queryFn: () => Promise.reject(new TypeError('Failed to fetch')),
});

function ReleaseProviderDemo({ query }: { readonly query: string }) {
  const provider = createReleaseProvider(STORY_PROFILE_ID);
  const { items, isLoading } = provider.useSearch(query);

  return (
    <div className='w-72 space-y-2' aria-busy={isLoading}>
      {isLoading ? (
        <p className='text-sm text-secondary-token'>Loading…</p>
      ) : null}
      {!isLoading && items.length === 0 ? (
        <p className='text-sm text-secondary-token'>No matching releases</p>
      ) : null}
      {items.map(item => (
        <div key={item.id} className='flex min-w-0 items-center gap-2'>
          {provider.renderChip(item)}
          <span className='shrink-0 text-xs text-secondary-token'>
            {item.meta?.subtitle}
          </span>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Jovie/ReleaseProvider',
  component: ReleaseProviderDemo,
  parameters: {
    layout: 'centered',
    queryClient: catalogClient,
  },
  decorators: [
    (Story, { parameters }) => (
      <QueryClientProvider
        client={(parameters.queryClient as QueryClient) ?? catalogClient}
      >
        <div className='bg-base p-3'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
  args: {
    query: '',
  },
} satisfies Meta<typeof ReleaseProviderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllReleases: Story = {};

export const FilteredByQuery: Story = {
  args: {
    query: 'midnight',
  },
};

export const LoadingCatalog: Story = {
  parameters: { queryClient: loadingClient },
};

/** No title or artist matches the query. */
export const EmptyNoMatches: Story = {
  args: { query: 'zzqx' },
};

/** A release without artwork, date or type falls back to a plain subtitle. */
export const PartialMissingMetadata: Story = {
  parameters: { queryClient: partialClient },
};

export const LongContentTitles: Story = {
  parameters: { queryClient: longClient },
};

/** The catalog failed to load offline: the provider returns no releases. */
export const OfflineCatalog: Story = {
  parameters: { queryClient: offlineClient },
};

export const RtlTitles: Story = {
  parameters: { queryClient: rtlClient },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
