import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries/keys';
import { createReleaseProvider } from './release-provider';

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

function ReleaseProviderDemo({ query }: { readonly query: string }) {
  const provider = createReleaseProvider('profile-1');
  const { items, isLoading } = provider.useSearch(query);

  return (
    <div className='w-72 space-y-2'>
      {isLoading ? (
        <p className='text-sm text-secondary-token'>Loading…</p>
      ) : (
        items.map(item => <div key={item.id}>{provider.renderChip(item)}</div>)
      )}
    </div>
  );
}

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    queryKeys.releases.matrix('profile-1'),
    mockReleases
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Jovie/ReleaseProvider',
  component: ReleaseProviderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <div className='bg-base p-3'>
          <Story />
        </div>
      </QueryProvider>
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
